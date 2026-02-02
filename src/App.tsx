import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { 
  Store, Tag, Package, GitCompare, AlertTriangle, CheckCircle, XCircle,
  Search, Download, RefreshCw, X, Eye,
  TrendingUp, BarChart3, Settings, Layers, ArrowUpDown
} from 'lucide-react'
import './App.css'

interface Restaurante {
  id: number
  geraldo_id: number
  nome: string
  ifood_uuid: string | null
  cats_geraldo: number
  cats_ifood: number
  itens_geraldo: number
  itens_ifood: number
  health: number
}

interface Item {
  id: number
  nome: string
  descricao: string
  preco: number
  categoria_nome: string
  restaurante_nome: string
  origem: string
  imagem_url: string
}

interface Divergencia {
  restaurante: string
  geraldo_id: number
  item_geraldo: string
  item_ifood: string
  preco_geraldo: number
  preco_ifood: number
  tipo: 'preco' | 'ausente_ifood' | 'ausente_geraldo'
}

type View = 'dashboard' | 'restaurantes' | 'itens' | 'comparacao' | 'divergencias'
type FilterStatus = 'todos' | 'ok' | 'pendente' | 'problema'

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [divergencias, setDivergencias] = useState<Divergencia[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  const [filterOrigem, setFilterOrigem] = useState<string>('todos')
  const [selectedRest, setSelectedRest] = useState<Restaurante | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelItens, setPanelItens] = useState<Item[]>([])
  const [sortField, setSortField] = useState('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [stats, setStats] = useState({
    restaurantes: 0,
    itens_geraldo: 0,
    itens_ifood: 0,
    sincronizados: 0,
    pendentes: 0,
    divergencias: 0,
    categorias: 0,
    precos: 0
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadRestaurantes(), loadStats()])
    setLoading(false)
  }

  async function loadRestaurantes() {
    const { data: rests } = await supabase.from('restaurantes').select('*').order('nome')
    const { data: cats } = await supabase.from('categorias').select('restaurante_id, origem')
    const { data: items } = await supabase.from('itens').select('categoria_id, categorias(restaurante_id, origem)')

    const map = new Map<number, Restaurante>()
    rests?.forEach(r => map.set(r.id, { ...r, cats_geraldo: 0, cats_ifood: 0, itens_geraldo: 0, itens_ifood: 0, health: 0 }))

    cats?.forEach(c => {
      const r = map.get(c.restaurante_id)
      if (r) c.origem === 'geraldo' ? r.cats_geraldo++ : r.cats_ifood++
    })

    items?.forEach((i: any) => {
      if (i.categorias) {
        const r = map.get(i.categorias.restaurante_id)
        if (r) i.categorias.origem === 'geraldo' ? r.itens_geraldo++ : r.itens_ifood++
      }
    })

    // Calcular saúde (0-5)
    map.forEach(r => {
      let h = 0
      if (r.ifood_uuid) h++
      if (r.itens_geraldo > 0) h++
      if (r.itens_ifood > 0) h++
      if (r.cats_geraldo > 0) h++
      if (Math.abs(r.itens_geraldo - r.itens_ifood) < r.itens_geraldo * 0.2) h++
      r.health = h
    })

    setRestaurantes(Array.from(map.values()))
  }

  async function loadStats() {
    const { data: rests } = await supabase.from('restaurantes').select('ifood_uuid')
    const { count: catG } = await supabase.from('categorias').select('*', { count: 'exact', head: true }).eq('origem', 'geraldo')
    const { count: catI } = await supabase.from('categorias').select('*', { count: 'exact', head: true }).eq('origem', 'ifood')
    const { count: itemG } = await supabase.from('itens').select('*, categorias!inner(origem)', { count: 'exact', head: true }).eq('categorias.origem', 'geraldo')
    const { count: itemI } = await supabase.from('itens').select('*, categorias!inner(origem)', { count: 'exact', head: true }).eq('categorias.origem', 'ifood')
    const { count: precos } = await supabase.from('precos').select('*', { count: 'exact', head: true })

    const sinc = rests?.filter(r => r.ifood_uuid).length || 0
    setStats({
      restaurantes: rests?.length || 0,
      itens_geraldo: itemG || 0,
      itens_ifood: itemI || 0,
      sincronizados: sinc,
      pendentes: (rests?.length || 0) - sinc,
      divergencias: 0,
      categorias: (catG || 0) + (catI || 0),
      precos: precos || 0
    })
  }

  async function loadItens(restId?: number) {
    let query = supabase.from('itens').select(`
      *, categorias(nome, origem, restaurante_id, restaurantes(nome)),
      precos(valor)
    `).limit(1000)

    if (restId) {
      const { data: cats } = await supabase.from('categorias').select('id').eq('restaurante_id', restId)
      if (cats?.length) query = query.in('categoria_id', cats.map(c => c.id))
    }

    const { data } = await query
    setItens(data?.map((i: any) => ({
      ...i,
      categoria_nome: i.categorias?.nome,
      restaurante_nome: i.categorias?.restaurantes?.nome,
      origem: i.categorias?.origem,
      preco: i.precos?.[0]?.valor || 0
    })) || [])
  }

  async function loadDivergencias() {
    const { data: gItens } = await supabase.from('itens').select('nome, categorias!inner(restaurante_id, origem, restaurantes(nome, geraldo_id)), precos(valor)').eq('categorias.origem', 'geraldo')
    const { data: iItens } = await supabase.from('itens').select('nome, categorias!inner(restaurante_id, origem), precos(valor)').eq('categorias.origem', 'ifood')

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    const iMap = new Map<string, any>()
    iItens?.forEach((i: any) => iMap.set(`${i.categorias.restaurante_id}_${norm(i.nome).slice(0, 15)}`, i))

    const divs: Divergencia[] = []
    gItens?.forEach((g: any) => {
      const key = `${g.categorias.restaurante_id}_${norm(g.nome).slice(0, 15)}`
      const match = iMap.get(key)
      const pG = g.precos?.[0]?.valor || 0
      const pI = match?.precos?.[0]?.valor || 0

      if (!match) {
        divs.push({
          restaurante: g.categorias.restaurantes?.nome || '',
          geraldo_id: g.categorias.restaurantes?.geraldo_id || 0,
          item_geraldo: g.nome,
          item_ifood: '-',
          preco_geraldo: pG,
          preco_ifood: 0,
          tipo: 'ausente_ifood'
        })
      } else if (Math.abs(pG - pI) > 0.5) {
        divs.push({
          restaurante: g.categorias.restaurantes?.nome || '',
          geraldo_id: g.categorias.restaurantes?.geraldo_id || 0,
          item_geraldo: g.nome,
          item_ifood: match.nome,
          preco_geraldo: pG,
          preco_ifood: pI,
          tipo: 'preco'
        })
      }
    })

    setDivergencias(divs.sort((a, b) => b.preco_geraldo - a.preco_geraldo).slice(0, 500))
    setStats(s => ({ ...s, divergencias: divs.length }))
  }

  async function openPanel(rest: Restaurante) {
    setSelectedRest(rest)
    setPanelOpen(true)
    
    const { data: cats } = await supabase.from('categorias').select('id').eq('restaurante_id', rest.id)
    const catIds = cats?.map(c => c.id) || []
    
    if (catIds.length) {
      const { data } = await supabase.from('itens').select('*, categorias(nome, origem), precos(valor)').in('categoria_id', catIds).limit(50)
      setPanelItens(data?.map((i: any) => ({
        ...i,
        categoria_nome: i.categorias?.nome,
        origem: i.categorias?.origem,
        preco: i.precos?.[0]?.valor || 0
      })) || [])
    }
  }

  function handleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function exportCSV() {
    let csv = ''
    if (view === 'restaurantes') {
      csv = 'Nome,ID,Itens Geraldo,Itens iFood,Status,Saude\n' +
        filtered.map(r => `"${r.nome}",${r.geraldo_id},${r.itens_geraldo},${r.itens_ifood},${r.ifood_uuid ? 'OK' : 'Pendente'},${r.health}/5`).join('\n')
    } else if (view === 'divergencias') {
      csv = 'Restaurante,Item Geraldo,Item iFood,Preco Geraldo,Preco iFood,Tipo\n' +
        divergencias.map(d => `"${d.restaurante}","${d.item_geraldo}","${d.item_ifood}",${d.preco_geraldo},${d.preco_ifood},${d.tipo}`).join('\n')
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${view}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  // Filtros
  const filtered = restaurantes.filter(r => {
    const matchSearch = r.nome.toLowerCase().includes(search.toLowerCase()) || r.geraldo_id.toString().includes(search)
    const matchStatus = filterStatus === 'todos' ||
      (filterStatus === 'ok' && r.ifood_uuid && r.health >= 4) ||
      (filterStatus === 'pendente' && !r.ifood_uuid) ||
      (filterStatus === 'problema' && r.health < 3)
    return matchSearch && matchStatus
  }).sort((a, b) => {
    const av = a[sortField as keyof Restaurante] ?? ''
    const bv = b[sortField as keyof Restaurante] ?? ''
    const cmp = typeof av === 'number' ? av - (bv as number) : String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const filteredItens = itens.filter(i => 
    (i.nome.toLowerCase().includes(search.toLowerCase()) || i.restaurante_nome?.toLowerCase().includes(search.toLowerCase())) &&
    (filterOrigem === 'todos' || i.origem === filterOrigem)
  )

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon"><Eye size={20} color="white" /></div>
            <div><h1>DashAIQ</h1><span>Olho de Deus</span></div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">Principal</div>
            <div className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
              <BarChart3 size={18} /> Dashboard
            </div>
            <div className={`nav-item ${view === 'restaurantes' ? 'active' : ''}`} onClick={() => setView('restaurantes')}>
              <Store size={18} /> Restaurantes
              <span className="nav-item-badge">{stats.restaurantes}</span>
            </div>
            <div className={`nav-item ${view === 'itens' ? 'active' : ''}`} onClick={() => { setView('itens'); loadItens() }}>
              <Package size={18} /> Itens
              <span className="nav-item-badge">{(stats.itens_geraldo + stats.itens_ifood).toLocaleString()}</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Análise</div>
            <div className={`nav-item ${view === 'comparacao' ? 'active' : ''}`} onClick={() => setView('comparacao')}>
              <GitCompare size={18} /> Comparação
            </div>
            <div className={`nav-item ${view === 'divergencias' ? 'active' : ''}`} onClick={() => { setView('divergencias'); loadDivergencias() }}>
              <AlertTriangle size={18} /> Divergências
              <span className="nav-item-badge">{stats.divergencias || '...'}</span>
            </div>
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Sistema</div>
            <div className="nav-item"><Settings size={18} /> Configurações</div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sync-status">
            <div className="sync-dot"></div>
            Banco conectado
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <div className="header-title">
              <h2>{view === 'dashboard' ? 'Dashboard' : view === 'restaurantes' ? 'Restaurantes' : view === 'itens' ? 'Itens' : view === 'comparacao' ? 'Comparação' : 'Divergências'}</h2>
              <p>Visão completa do seu cardápio</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={exportCSV}><Download size={16} /> Exportar</button>
            <button className="btn btn-primary" onClick={loadAll}><RefreshCw size={16} /> Atualizar</button>
          </div>
        </header>

        {/* Content */}
        <div className="content">
          {loading ? (
            <div className="loading"><div className="spinner"></div> Carregando...</div>
          ) : view === 'dashboard' ? (
            <>
              {/* Stats */}
              <div className="stats-row">
                <div className="stat-card clickable" onClick={() => setView('restaurantes')}>
                  <div className="stat-header">
                    <div className="stat-icon orange"><Store size={20} /></div>
                  </div>
                  <div className="stat-value">{stats.restaurantes}</div>
                  <div className="stat-label">Restaurantes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon blue"><Package size={20} /></div>
                    <span className="stat-trend up">Geraldo</span>
                  </div>
                  <div className="stat-value">{stats.itens_geraldo.toLocaleString()}</div>
                  <div className="stat-label">Itens Geraldo</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon red"><Package size={20} /></div>
                    <span className="stat-trend down">iFood</span>
                  </div>
                  <div className="stat-value">{stats.itens_ifood.toLocaleString()}</div>
                  <div className="stat-label">Itens iFood</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon green"><CheckCircle size={20} /></div></div>
                  <div className="stat-value">{stats.sincronizados}</div>
                  <div className="stat-label">Sincronizados</div>
                  <div className="stat-sub">{((stats.sincronizados / stats.restaurantes) * 100).toFixed(0)}% do total</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon yellow"><AlertTriangle size={20} /></div></div>
                  <div className="stat-value">{stats.pendentes}</div>
                  <div className="stat-label">Pendentes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon blue"><Tag size={20} /></div></div>
                  <div className="stat-value">{stats.precos.toLocaleString()}</div>
                  <div className="stat-label">Preços</div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="filters-bar">
                <h3 style={{ flex: 1 }}>Ações Rápidas</h3>
                <button className="btn btn-secondary" onClick={() => { setView('divergencias'); loadDivergencias() }}>
                  <AlertTriangle size={16} /> Ver Divergências
                </button>
                <button className="btn btn-secondary" onClick={() => { setView('itens'); loadItens() }}>
                  <Package size={16} /> Ver Todos Itens
                </button>
                <button className="btn btn-primary" onClick={() => setView('restaurantes')}>
                  <Store size={16} /> Ver Restaurantes
                </button>
              </div>

              {/* Top Restaurantes */}
              <div className="table-container">
                <div className="table-header">
                  <h3>Restaurantes com Problemas</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Restaurante</th>
                      <th>Itens G</th>
                      <th>Itens iF</th>
                      <th>Saúde</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restaurantes.filter(r => r.health < 4).slice(0, 10).map(r => (
                      <tr key={r.id} onClick={() => openPanel(r)} style={{ cursor: 'pointer' }}>
                        <td><div className="cell-main">{r.nome}</div><div className="cell-sub">ID: {r.geraldo_id}</div></td>
                        <td><span className="badge badge-neutral">{r.itens_geraldo}</span></td>
                        <td><span className="badge badge-neutral">{r.itens_ifood}</span></td>
                        <td>
                          <div className="health-bar">
                            {[...Array(5)].map((_, i) => (
                              <div key={i} className={`health-segment ${i < r.health ? (r.health >= 4 ? 'filled' : r.health >= 2 ? 'warning' : 'danger') : ''}`} />
                            ))}
                          </div>
                        </td>
                        <td>{r.ifood_uuid ? <span className="badge badge-success badge-sm">OK</span> : <span className="badge badge-warning badge-sm">Pendente</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : view === 'restaurantes' ? (
            <>
              {/* Filters */}
              <div className="filters-bar">
                <div className="search-box">
                  <Search size={18} />
                  <input placeholder="Buscar restaurante..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="filter-chips">
                  {(['todos', 'ok', 'pendente', 'problema'] as FilterStatus[]).map(f => (
                    <div key={f} className={`chip ${filterStatus === f ? 'active' : ''}`} onClick={() => setFilterStatus(f)}>
                      {f === 'todos' && <Layers size={14} />}
                      {f === 'ok' && <CheckCircle size={14} />}
                      {f === 'pendente' && <AlertTriangle size={14} />}
                      {f === 'problema' && <XCircle size={14} />}
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      <span className="chip-count">
                        {f === 'todos' ? stats.restaurantes : f === 'ok' ? stats.sincronizados : f === 'pendente' ? stats.pendentes : restaurantes.filter(r => r.health < 3).length}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="table-container">
                <div className="table-header">
                  <h3>{filtered.length} restaurantes</h3>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort('nome')}>Restaurante <ArrowUpDown size={14} /></th>
                      <th className="sortable" onClick={() => handleSort('itens_geraldo')}>Itens Geraldo <ArrowUpDown size={14} /></th>
                      <th className="sortable" onClick={() => handleSort('itens_ifood')}>Itens iFood <ArrowUpDown size={14} /></th>
                      <th>Saúde</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id}>
                        <td>
                          <div className="cell-flex">
                            <div className="cell-avatar">{r.nome.charAt(0)}</div>
                            <div><div className="cell-main">{r.nome}</div><div className="cell-sub">ID: {r.geraldo_id}</div></div>
                          </div>
                        </td>
                        <td><span className="badge badge-info">{r.itens_geraldo}</span></td>
                        <td><span className="badge badge-danger badge-sm">{r.itens_ifood}</span></td>
                        <td>
                          <div className="health-indicator">
                            <div className="health-bar">
                              {[...Array(5)].map((_, i) => (
                                <div key={i} className={`health-segment ${i < r.health ? (r.health >= 4 ? 'filled' : r.health >= 2 ? 'warning' : 'danger') : ''}`} />
                              ))}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.health}/5</span>
                          </div>
                        </td>
                        <td>
                          {r.ifood_uuid ? <span className="badge badge-success"><CheckCircle size={12} /> Sincronizado</span> : <span className="badge badge-warning"><AlertTriangle size={12} /> Pendente</span>}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => openPanel(r)}><Eye size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : view === 'itens' ? (
            <>
              <div className="filters-bar">
                <div className="search-box">
                  <Search size={18} />
                  <input placeholder="Buscar item..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="filter-group">
                  <label>Origem:</label>
                  <select className="filter-select" value={filterOrigem} onChange={e => setFilterOrigem(e.target.value)}>
                    <option value="todos">Todas</option>
                    <option value="geraldo">Geraldo</option>
                    <option value="ifood">iFood</option>
                  </select>
                </div>
              </div>

              <div className="table-container">
                <div className="table-header"><h3>{filteredItens.length} itens</h3></div>
                <table>
                  <thead>
                    <tr><th>Item</th><th>Restaurante</th><th>Categoria</th><th>Origem</th><th>Preço</th></tr>
                  </thead>
                  <tbody>
                    {filteredItens.slice(0, 100).map(i => (
                      <tr key={i.id}>
                        <td><div className="cell-main">{i.nome}</div><div className="cell-sub">{i.descricao?.slice(0, 50)}</div></td>
                        <td>{i.restaurante_nome}</td>
                        <td><span className="badge badge-neutral badge-sm">{i.categoria_nome}</span></td>
                        <td><span className={`badge badge-sm ${i.origem === 'geraldo' ? 'badge-info' : 'badge-danger'}`}>{i.origem}</span></td>
                        <td><strong>R$ {i.preco?.toFixed(2) || '0.00'}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : view === 'divergencias' ? (
            <>
              <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon red"><AlertTriangle size={20} /></div></div>
                  <div className="stat-value">{divergencias.length}</div>
                  <div className="stat-label">Total Divergências</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon yellow"><TrendingUp size={20} /></div></div>
                  <div className="stat-value">{divergencias.filter(d => d.tipo === 'preco').length}</div>
                  <div className="stat-label">Preços Diferentes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon blue"><XCircle size={20} /></div></div>
                  <div className="stat-value">{divergencias.filter(d => d.tipo === 'ausente_ifood').length}</div>
                  <div className="stat-label">Ausente no iFood</div>
                </div>
              </div>

              <div className="filters-bar">
                <div className="search-box">
                  <Search size={18} />
                  <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>

              <div className="table-container">
                <div className="table-header"><h3>Divergências Encontradas</h3></div>
                <table>
                  <thead>
                    <tr><th>Restaurante</th><th>Item Geraldo</th><th>Item iFood</th><th>R$ Geraldo</th><th>R$ iFood</th><th>Tipo</th></tr>
                  </thead>
                  <tbody>
                    {divergencias.filter(d => d.restaurante.toLowerCase().includes(search.toLowerCase()) || d.item_geraldo.toLowerCase().includes(search.toLowerCase())).slice(0, 100).map((d, i) => (
                      <tr key={i}>
                        <td><div className="cell-main">{d.restaurante}</div><div className="cell-sub">ID: {d.geraldo_id}</div></td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.item_geraldo}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.item_ifood}</td>
                        <td><strong>R$ {d.preco_geraldo.toFixed(2)}</strong></td>
                        <td>{d.preco_ifood > 0 ? `R$ ${d.preco_ifood.toFixed(2)}` : '-'}</td>
                        <td>
                          {d.tipo === 'preco' && <span className="badge badge-warning">Preço ≠</span>}
                          {d.tipo === 'ausente_ifood' && <span className="badge badge-danger">Sem iFood</span>}
                          {d.tipo === 'ausente_geraldo' && <span className="badge badge-info">Sem Geraldo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </main>

      {/* Side Panel */}
      <div className={`overlay ${panelOpen ? 'visible' : ''}`} onClick={() => setPanelOpen(false)} />
      <aside className={`side-panel ${panelOpen ? 'open' : ''}`}>
        {selectedRest && (
          <>
            <div className="side-panel-header">
              <h3>{selectedRest.nome}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setPanelOpen(false)}><X size={20} /></button>
            </div>
            <div className="side-panel-content">
              <div className="side-panel-section">
                <h4>Informações</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-item-label">Geraldo ID</div>
                    <div className="info-item-value">{selectedRest.geraldo_id}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Saúde</div>
                    <div className="info-item-value">{selectedRest.health}/5</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Categorias</div>
                    <div className="info-item-value">{selectedRest.cats_geraldo} G / {selectedRest.cats_ifood} iF</div>
                  </div>
                  <div className="info-item">
                    <div className="info-item-label">Itens</div>
                    <div className="info-item-value">{selectedRest.itens_geraldo} G / {selectedRest.itens_ifood} iF</div>
                  </div>
                </div>
                <div className="info-item" style={{ marginBottom: 0 }}>
                  <div className="info-item-label">iFood UUID</div>
                  <div className="info-item-value" style={{ fontSize: 11 }}>{selectedRest.ifood_uuid || 'Não vinculado'}</div>
                </div>
              </div>

              <div className="side-panel-section">
                <h4>Itens ({panelItens.length})</h4>
                <div className="items-list">
                  {panelItens.map(i => (
                    <div key={i.id} className="item-row">
                      <div className="item-row-origem">
                        <span className={`badge badge-sm ${i.origem === 'geraldo' ? 'badge-info' : 'badge-danger'}`}>{i.origem === 'geraldo' ? 'G' : 'iF'}</span>
                      </div>
                      <div className="item-row-nome" title={i.nome}>{i.nome}</div>
                      <div className="item-row-preco">R$ {i.preco?.toFixed(2) || '0.00'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

export default App

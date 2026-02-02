import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { Home, Store, Tag, RefreshCw, Download, Eye, Settings, Search, Filter, ArrowUpDown, X, AlertTriangle, CheckCircle } from 'lucide-react'
import './App.css'

interface Restaurante {
  id: number
  geraldo_id: number
  nome: string
  ifood_uuid: string | null
  cats_geraldo?: number
  cats_ifood?: number
  itens_geraldo?: number
  itens_ifood?: number
}

interface Item {
  id: number
  nome: string
  descricao: string
  preco?: number
  categoria_nome?: string
  origem?: string
}

interface Comparacao {
  restaurante: string
  item_geraldo: string
  item_ifood: string
  preco_geraldo: number
  preco_ifood: number
  diferenca: number
  status: 'igual' | 'diferente' | 'so_geraldo' | 'so_ifood'
}

type Tab = 'restaurantes' | 'itens' | 'comparacao'
type FilterStatus = 'todos' | 'sincronizados' | 'pendentes'

function App() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [stats, setStats] = useState({
    restaurantes: 0, categorias_geraldo: 0, categorias_ifood: 0,
    itens_geraldo: 0, itens_ifood: 0, precos: 0, sincronizados: 0, pendentes: 0
  })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<Tab>('restaurantes')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  const [selectedRestaurante, setSelectedRestaurante] = useState<Restaurante | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [comparacoes, setComparacoes] = useState<Comparacao[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalContent, setModalContent] = useState<'cookie' | 'detalhes'>('cookie')
  const [cookieValue, setCookieValue] = useState('')
  const [sortField, setSortField] = useState<string>('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (activeTab === 'comparacao') loadComparacoes() }, [activeTab])

  async function loadData() {
    setLoading(true)
    try {
      const { data: rests } = await supabase.from('restaurantes').select('*').order('nome')
      const { data: catCounts } = await supabase.from('categorias').select('restaurante_id, origem')
      const { data: itemCounts } = await supabase.from('itens').select('categoria_id, categorias(restaurante_id, origem)')

      const restMap = new Map<number, Restaurante>()
      rests?.forEach(r => restMap.set(r.id, { ...r, cats_geraldo: 0, cats_ifood: 0, itens_geraldo: 0, itens_ifood: 0 }))

      catCounts?.forEach(c => {
        const rest = restMap.get(c.restaurante_id)
        if (rest) c.origem === 'geraldo' ? rest.cats_geraldo!++ : rest.cats_ifood!++
      })

      itemCounts?.forEach((i: any) => {
        if (i.categorias) {
          const rest = restMap.get(i.categorias.restaurante_id)
          if (rest) i.categorias.origem === 'geraldo' ? rest.itens_geraldo!++ : rest.itens_ifood!++
        }
      })

      const lista = Array.from(restMap.values())
      setRestaurantes(lista)

      const { count: catGeraldo } = await supabase.from('categorias').select('*', { count: 'exact', head: true }).eq('origem', 'geraldo')
      const { count: catIfood } = await supabase.from('categorias').select('*', { count: 'exact', head: true }).eq('origem', 'ifood')
      const { count: precoCount } = await supabase.from('precos').select('*', { count: 'exact', head: true })

      const sincronizados = lista.filter(r => r.ifood_uuid).length
      setStats({
        restaurantes: lista.length,
        categorias_geraldo: catGeraldo || 0,
        categorias_ifood: catIfood || 0,
        itens_geraldo: lista.reduce((a, r) => a + (r.itens_geraldo || 0), 0),
        itens_ifood: lista.reduce((a, r) => a + (r.itens_ifood || 0), 0),
        precos: precoCount || 0,
        sincronizados,
        pendentes: lista.length - sincronizados
      })
    } catch (err) { console.error('Erro:', err) }
    setLoading(false)
  }

  async function loadItens(restauranteId?: number) {
    let query = supabase.from('itens').select('*, categorias(nome, origem, restaurante_id), precos(valor)').limit(500)
    
    if (restauranteId) {
      const { data: cats } = await supabase.from('categorias').select('id').eq('restaurante_id', restauranteId)
      if (cats?.length) query = query.in('categoria_id', cats.map(c => c.id))
    }

    const { data } = await query
    setItens(data?.map((i: any) => ({
      ...i, categoria_nome: i.categorias?.nome, origem: i.categorias?.origem, preco: i.precos?.[0]?.valor
    })) || [])
  }

  async function loadComparacoes() {
    const { data: itensG } = await supabase.from('itens').select('id, nome, categorias!inner(restaurante_id, origem), precos(valor)').eq('categorias.origem', 'geraldo')
    const { data: itensI } = await supabase.from('itens').select('id, nome, categorias!inner(restaurante_id, origem), precos(valor)').eq('categorias.origem', 'ifood')

    const gMap = new Map<number, any[]>(), iMap = new Map<number, any[]>()
    itensG?.forEach((i: any) => { const r = i.categorias.restaurante_id; if (!gMap.has(r)) gMap.set(r, []); gMap.get(r)?.push(i) })
    itensI?.forEach((i: any) => { const r = i.categorias.restaurante_id; if (!iMap.has(r)) iMap.set(r, []); iMap.get(r)?.push(i) })

    const comps: Comparacao[] = []
    const restNames = new Map(restaurantes.map(r => [r.id, r.nome]))

    gMap.forEach((itens, restId) => {
      const itensIfood = iMap.get(restId) || []
      const restNome = restNames.get(restId) || ''

      itens.forEach(ig => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
        const match = itensIfood.find(ii => norm(ii.nome).includes(norm(ig.nome).slice(0, 8)) || norm(ig.nome).includes(norm(ii.nome).slice(0, 8)))
        
        const pG = ig.precos?.[0]?.valor || 0, pI = match?.precos?.[0]?.valor || 0
        comps.push({
          restaurante: restNome,
          item_geraldo: ig.nome,
          item_ifood: match?.nome || '-',
          preco_geraldo: pG,
          preco_ifood: pI,
          diferenca: pI - pG,
          status: match ? (Math.abs(pI - pG) < 0.01 ? 'igual' : 'diferente') : 'so_geraldo'
        })
      })
    })

    setComparacoes(comps.sort((a, b) => {
      const ord = { diferente: 0, so_geraldo: 1, so_ifood: 2, igual: 3 }
      return ord[a.status] - ord[b.status]
    }).slice(0, 500))
  }

  function handleExportCSV() {
    let csv = ''
    if (activeTab === 'restaurantes') {
      csv = [['ID', 'Nome', 'Geraldo ID', 'iFood', 'Itens G', 'Itens iF'].join(','),
        ...filteredRestaurantes.map(r => [r.id, `"${r.nome}"`, r.geraldo_id, r.ifood_uuid ? 'Sim' : 'Não', r.itens_geraldo, r.itens_ifood].join(','))
      ].join('\n')
    } else if (activeTab === 'comparacao') {
      csv = [['Restaurante', 'Item Geraldo', 'Item iFood', 'Preço G', 'Preço iF', 'Diff', 'Status'].join(','),
        ...comparacoes.map(c => [`"${c.restaurante}"`, `"${c.item_geraldo}"`, `"${c.item_ifood}"`, c.preco_geraldo, c.preco_ifood, c.diferenca.toFixed(2), c.status].join(','))
      ].join('\n')
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${activeTab}_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  function handleSort(field: string) {
    setSortDir(sortField === field && sortDir === 'asc' ? 'desc' : 'asc')
    setSortField(field)
  }

  function openDetalhes(r: Restaurante) {
    setSelectedRestaurante(r)
    loadItens(r.id)
    setModalContent('detalhes')
    setShowModal(true)
  }

  const filteredRestaurantes = restaurantes
    .filter(r => (r.nome.toLowerCase().includes(search.toLowerCase()) || r.geraldo_id.toString().includes(search)) &&
      (filterStatus === 'todos' || (filterStatus === 'sincronizados' ? r.ifood_uuid : !r.ifood_uuid)))
    .sort((a, b) => {
      const av = a[sortField as keyof Restaurante] || '', bv = b[sortField as keyof Restaurante] || ''
      return (sortDir === 'asc' ? 1 : -1) * String(av).localeCompare(String(bv), undefined, { numeric: true })
    })

  const filteredComparacoes = comparacoes.filter(c => c.restaurante.toLowerCase().includes(search.toLowerCase()) || c.item_geraldo.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo"><Home size={20} /></div>
          <div className="header-title"><h1>DashAIQ</h1><p>Monitor iFood ↔ Geraldo</p></div>
        </div>
        <div className="header-stats">
          <span><Store size={16} /> {stats.restaurantes}</span>
          <span><Tag size={16} /> {stats.itens_geraldo + stats.itens_ifood} itens</span>
          <span><CheckCircle size={16} /> {stats.sincronizados}</span>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => { setSyncing(true); loadData().then(() => setSyncing(false)) }} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'spinning' : ''} /> {syncing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button className="btn btn-secondary" onClick={handleExportCSV}><Download size={16} /> CSV</button>
          <button className="btn btn-secondary" onClick={() => { setModalContent('cookie'); setShowModal(true) }}><Settings size={16} /></button>
        </div>
      </header>

      <main className="main">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-header"><span className="stat-label">Restaurantes</span><div className="stat-icon blue"><Store size={18} /></div></div><div className="stat-value">{stats.restaurantes}</div></div>
          <div className="stat-card"><div className="stat-header"><span className="stat-label">Itens Geraldo</span><div className="stat-icon green"><Tag size={18} /></div></div><div className="stat-value">{stats.itens_geraldo.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-header"><span className="stat-label">Itens iFood</span><div className="stat-icon green"><Tag size={18} /></div></div><div className="stat-value">{stats.itens_ifood.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-header"><span className="stat-label">Preços</span><div className="stat-icon blue"><Tag size={18} /></div></div><div className="stat-value">{stats.precos.toLocaleString()}</div></div>
          <div className="stat-card"><div className="stat-header"><span className="stat-label">Sincronizados</span><div className="stat-icon green"><CheckCircle size={18} /></div></div><div className="stat-value">{stats.sincronizados}</div></div>
          <div className="stat-card warning"><div className="stat-header"><span className="stat-label">Pendentes</span><div className="stat-icon yellow"><AlertTriangle size={18} /></div></div><div className="stat-value">{stats.pendentes}</div></div>
        </div>

        <div className="tabs">
          <button className={`tab ${activeTab === 'restaurantes' ? 'active' : ''}`} onClick={() => setActiveTab('restaurantes')}><Store size={16} /> Restaurantes <span className="tab-count">{stats.restaurantes}</span></button>
          <button className={`tab ${activeTab === 'itens' ? 'active' : ''}`} onClick={() => { setActiveTab('itens'); loadItens() }}><Tag size={16} /> Itens <span className="tab-count">{stats.itens_geraldo + stats.itens_ifood}</span></button>
          <button className={`tab ${activeTab === 'comparacao' ? 'active' : ''}`} onClick={() => setActiveTab('comparacao')}><ArrowUpDown size={16} /> Comparação <span className="tab-count">{comparacoes.length}</span></button>
        </div>

        <div className="filters">
          <div className="search-wrapper"><Search size={18} /><input type="text" className="search-input" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />{search && <X size={18} className="clear-search" onClick={() => setSearch('')} />}</div>
          <div className="filter-group"><Filter size={16} /><select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)}><option value="todos">Todos</option><option value="sincronizados">Sincronizados</option><option value="pendentes">Pendentes</option></select></div>
          <span className="pagination">{activeTab === 'restaurantes' ? `${filteredRestaurantes.length} de ${stats.restaurantes}` : activeTab === 'comparacao' ? `${filteredComparacoes.length} comparações` : `${itens.length} itens`}</span>
        </div>

        <div className="table-container">
          {loading ? <div className="loading"><div className="spinner"></div>Carregando...</div> : activeTab === 'restaurantes' ? (
            <table>
              <thead><tr>
                <th onClick={() => handleSort('nome')} className="sortable">Restaurante <ArrowUpDown size={14} /></th>
                <th>ID</th>
                <th onClick={() => handleSort('itens_geraldo')} className="sortable">Itens G <ArrowUpDown size={14} /></th>
                <th onClick={() => handleSort('itens_ifood')} className="sortable">Itens iF <ArrowUpDown size={14} /></th>
                <th>Status</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>{filteredRestaurantes.map(r => (
                <tr key={r.id}>
                  <td><div className="restaurant-name">{r.nome}</div></td>
                  <td>{r.geraldo_id}</td>
                  <td><span className="badge badge-neutral">{r.itens_geraldo || 0}</span></td>
                  <td><span className="badge badge-neutral">{r.itens_ifood || 0}</span></td>
                  <td>{r.ifood_uuid ? <span className="badge badge-success"><CheckCircle size={12} /> OK</span> : <span className="badge badge-warning"><AlertTriangle size={12} /> Pendente</span>}</td>
                  <td><button className="btn btn-secondary btn-action" onClick={() => openDetalhes(r)}><Eye size={14} /> Ver</button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : activeTab === 'comparacao' ? (
            <table>
              <thead><tr><th>Restaurante</th><th>Item Geraldo</th><th>Item iFood</th><th>R$ G</th><th>R$ iF</th><th>Diff</th><th>Status</th></tr></thead>
              <tbody>{filteredComparacoes.slice(0, 100).map((c, i) => (
                <tr key={i}>
                  <td>{c.restaurante}</td>
                  <td className="item-name">{c.item_geraldo}</td>
                  <td className="item-name">{c.item_ifood}</td>
                  <td>R$ {c.preco_geraldo.toFixed(2)}</td>
                  <td>{c.preco_ifood > 0 ? `R$ ${c.preco_ifood.toFixed(2)}` : '-'}</td>
                  <td className={c.diferenca > 0 ? 'diff-up' : c.diferenca < 0 ? 'diff-down' : ''}>{c.diferenca !== 0 ? `${c.diferenca > 0 ? '+' : ''}R$ ${c.diferenca.toFixed(2)}` : '-'}</td>
                  <td>{c.status === 'igual' ? <span className="badge badge-success">✓</span> : c.status === 'diferente' ? <span className="badge badge-warning">≠</span> : <span className="badge badge-error">Só G</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Item</th><th>Categoria</th><th>Origem</th><th>Preço</th></tr></thead>
              <tbody>{itens.slice(0, 100).map(i => (
                <tr key={i.id}>
                  <td><div className="item-name">{i.nome}</div><div className="item-desc">{i.descricao?.slice(0, 50)}</div></td>
                  <td>{i.categoria_nome}</td>
                  <td><span className={`badge ${i.origem === 'geraldo' ? 'badge-blue' : 'badge-orange'}`}>{i.origem}</span></td>
                  <td>{i.preco ? `R$ ${i.preco.toFixed(2)}` : '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            {modalContent === 'cookie' ? (
              <><h2>🍪 Cookie Geraldo</h2><p style={{ color: '#6b7280', marginBottom: 16 }}>Cole o storage_state.json</p>
              <textarea placeholder='{"cookies": [...]}' value={cookieValue} onChange={e => setCookieValue(e.target.value)} />
              <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => { localStorage.setItem('geraldo_cookies', cookieValue); setShowModal(false); alert('Salvo!') }}>Salvar</button></div></>
            ) : selectedRestaurante && (
              <><h2>{selectedRestaurante.nome}</h2>
              <div className="modal-info"><p><strong>Geraldo:</strong> {selectedRestaurante.geraldo_id}</p><p><strong>iFood:</strong> {selectedRestaurante.ifood_uuid || 'Não vinculado'}</p><p><strong>Itens:</strong> {selectedRestaurante.itens_geraldo} G / {selectedRestaurante.itens_ifood} iF</p></div>
              <h3>Itens</h3><div className="modal-items">{itens.slice(0, 15).map(i => (<div key={i.id} className="modal-item"><span className={`badge-small ${i.origem === 'geraldo' ? 'badge-blue' : 'badge-orange'}`}>{i.origem}</span><span>{i.nome}</span><span>{i.preco ? `R$ ${i.preco.toFixed(2)}` : ''}</span></div>))}</div></>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App

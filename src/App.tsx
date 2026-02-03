import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './index.css'

// ==================== TYPES ====================
interface Restaurante {
  id: number
  geraldo_id: number
  nome: string
  ifood_uuid: string | null
  geraldo_link: string | null
  vitrine_link: string | null
  // Computed
  total_cats: number
  total_itens: number
  sem_foto: number
  sem_desc: number
  sem_preco: number
}

interface Categoria {
  id: number
  nome: string
  origem: string
  total_itens: number
  sem_foto: number
  sem_desc: number
  sem_preco: number
}

interface Item {
  id: number
  nome: string
  descricao: string | null
  imagem_url: string | null
  origem: string
  origem_id: string | null
  categoria_id: number
  categoria_nome: string
  restaurante_id: number
  restaurante_nome: string
  precos: { valor: number | null; tamanho_nome: string | null }[]
  // Flags
  sem_foto: boolean
  sem_desc: boolean
  sem_preco: boolean
}

type View = 'home' | 'restaurante' | 'itens'
type Tab = 'monitor' | 'itens' | 'ifood' | 'matches'
type Filter = 'todos' | 'sem_foto' | 'sem_desc' | 'sem_preco'

// ==================== APP ====================
function App() {
  const [view, setView] = useState<View>('home')
  const [selectedRestId, setSelectedRestId] = useState<number | null>(null)
  
  function navigateTo(v: View, restId?: number) {
    setView(v)
    if (restId) setSelectedRestId(restId)
  }

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={navigateTo} />
      <main className="main">
        {view === 'home' && <HomePage onSelectRest={(id) => navigateTo('restaurante', id)} />}
        {view === 'restaurante' && selectedRestId && (
          <RestaurantePage restId={selectedRestId} onBack={() => navigateTo('home')} />
        )}
        {view === 'itens' && <ItensPage />}
      </main>
    </div>
  )
}

// ==================== SIDEBAR ====================
function Sidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">👁️</span>
          <div>
            <h1>PainelGPT</h1>
            <span>Monitor Geraldo</span>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <div className={`nav-item ${view === 'home' ? 'active' : ''}`} onClick={() => onNavigate('home')}>
          🏠 Restaurantes
        </div>
        <div className={`nav-item ${view === 'itens' ? 'active' : ''}`} onClick={() => onNavigate('itens')}>
          📦 Itens Global
        </div>
      </nav>
      <div className="sidebar-footer">
        <div className="status">🟢 Conectado</div>
      </div>
    </aside>
  )
}

// ==================== HOME PAGE ====================
function HomePage({ onSelectRest }: { onSelectRest: (id: number) => void }) {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'todos' | 'com_problema' | 'sem_ifood'>('todos')
  const [stats, setStats] = useState({ total: 0, sem_ifood: 0, sem_foto: 0, sem_desc: 0, sem_preco: 0 })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    
    // Carregar restaurantes
    const { data: rests } = await supabase.from('restaurantes').select('*').order('nome')
    
    // Carregar categorias e itens para calcular stats
    const { data: cats } = await supabase.from('categorias').select('id, restaurante_id, origem')
    const { data: itens } = await supabase.from('itens').select('id, nome, descricao, imagem_url, categoria_id, categorias!inner(restaurante_id, origem)').eq('categorias.origem', 'geraldo')
    const { data: precos } = await supabase.from('precos').select('item_id, valor')

    // Mapear preços por item
    const precoMap = new Map<number, number[]>()
    precos?.forEach(p => {
      if (!precoMap.has(p.item_id)) precoMap.set(p.item_id, [])
      if (p.valor != null) precoMap.get(p.item_id)!.push(p.valor)
    })

    // Calcular stats por restaurante
    const restMap = new Map<number, Restaurante>()
    rests?.forEach(r => {
      restMap.set(r.id, {
        ...r,
        total_cats: 0,
        total_itens: 0,
        sem_foto: 0,
        sem_desc: 0,
        sem_preco: 0
      })
    })

    // Contar categorias
    cats?.filter(c => c.origem === 'geraldo').forEach(c => {
      const r = restMap.get(c.restaurante_id)
      if (r) r.total_cats++
    })

    // Contar itens e flags
    itens?.forEach((i: any) => {
      const restId = i.categorias?.restaurante_id
      const r = restMap.get(restId)
      if (r) {
        r.total_itens++
        if (!i.imagem_url) r.sem_foto++
        if (!i.descricao || i.descricao.trim() === '') r.sem_desc++
        const itemPrecos = precoMap.get(i.id) || []
        if (itemPrecos.length === 0) r.sem_preco++
      }
    })

    const lista = Array.from(restMap.values())
    setRestaurantes(lista)
    
    // Stats globais
    setStats({
      total: lista.length,
      sem_ifood: lista.filter(r => !r.ifood_uuid).length,
      sem_foto: lista.reduce((acc, r) => acc + r.sem_foto, 0),
      sem_desc: lista.reduce((acc, r) => acc + r.sem_desc, 0),
      sem_preco: lista.reduce((acc, r) => acc + r.sem_preco, 0)
    })
    
    setLoading(false)
  }

  // Filtrar
  const filtered = restaurantes.filter(r => {
    const matchSearch = r.nome.toLowerCase().includes(search.toLowerCase()) || r.geraldo_id.toString().includes(search)
    const matchFilter = filter === 'todos' ? true :
      filter === 'sem_ifood' ? !r.ifood_uuid :
      (r.sem_foto > 0 || r.sem_desc > 0 || r.sem_preco > 0)
    return matchSearch && matchFilter
  })

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Restaurantes</h2>
          <p>Monitor de qualidade do cardápio Geraldo</p>
        </div>
        <button className="btn btn-primary" onClick={loadData}>🔄 Atualizar</button>
      </header>

      {/* KPIs */}
      <div className="kpi-row">
        <div className={`kpi ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>
          <div className="kpi-value">{stats.total}</div>
          <div className="kpi-label">Total</div>
        </div>
        <div className={`kpi ${filter === 'sem_ifood' ? 'active' : ''}`} onClick={() => setFilter('sem_ifood')}>
          <div className="kpi-value red">{stats.sem_ifood}</div>
          <div className="kpi-label">Sem iFood</div>
        </div>
        <div className={`kpi ${filter === 'com_problema' ? 'active' : ''}`} onClick={() => setFilter('com_problema')}>
          <div className="kpi-value orange">{stats.sem_foto}</div>
          <div className="kpi-label">Itens s/ Foto</div>
        </div>
        <div className="kpi" onClick={() => setFilter('com_problema')}>
          <div className="kpi-value orange">{stats.sem_desc}</div>
          <div className="kpi-label">Itens s/ Desc</div>
        </div>
        <div className="kpi" onClick={() => setFilter('com_problema')}>
          <div className="kpi-value orange">{stats.sem_preco}</div>
          <div className="kpi-label">Itens s/ Preço</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters">
        <input 
          type="text" 
          className="search-input" 
          placeholder="🔍 Buscar restaurante..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
        <div className="filter-chips">
          <span className={`chip ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos</span>
          <span className={`chip ${filter === 'com_problema' ? 'active' : ''}`} onClick={() => setFilter('com_problema')}>⚠️ Com Problema</span>
          <span className={`chip ${filter === 'sem_ifood' ? 'active' : ''}`} onClick={() => setFilter('sem_ifood')}>❌ Sem iFood</span>
        </div>
        <span className="filter-count">{filtered.length} restaurantes</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="loading">Carregando...</div>
      ) : (
        <div className="restaurant-grid">
          {filtered.map(r => (
            <div key={r.id} className="restaurant-card" onClick={() => onSelectRest(r.id)}>
              <div className="card-header">
                <div className="card-avatar">{r.nome.charAt(0)}</div>
                <div className="card-info">
                  <div className="card-name">{r.nome}</div>
                  <div className="card-id">ID: {r.geraldo_id}</div>
                </div>
                {r.ifood_uuid ? <span className="badge badge-success">iFood ✓</span> : <span className="badge badge-danger">Sem iFood</span>}
              </div>
              
              <div className="card-stats">
                <div className="card-stat">
                  <span className="stat-value">{r.total_cats}</span>
                  <span className="stat-label">Categorias</span>
                </div>
                <div className="card-stat">
                  <span className="stat-value">{r.total_itens}</span>
                  <span className="stat-label">Itens</span>
                </div>
                <div className="card-stat">
                  <span className={`stat-value ${r.sem_foto > 0 ? 'red' : 'green'}`}>{r.sem_foto}</span>
                  <span className="stat-label">s/ Foto</span>
                </div>
                <div className="card-stat">
                  <span className={`stat-value ${r.sem_desc > 0 ? 'red' : 'green'}`}>{r.sem_desc}</span>
                  <span className="stat-label">s/ Desc</span>
                </div>
                <div className="card-stat">
                  <span className={`stat-value ${r.sem_preco > 0 ? 'red' : 'green'}`}>{r.sem_preco}</span>
                  <span className="stat-label">s/ Preço</span>
                </div>
              </div>

              <div className="card-actions">
                {r.geraldo_link && <a href={r.geraldo_link} target="_blank" className="link-btn" onClick={e => e.stopPropagation()}>🔗 Geraldo</a>}
                {r.vitrine_link && <a href={r.vitrine_link} target="_blank" className="link-btn" onClick={e => e.stopPropagation()}>🏪 Vitrine</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==================== RESTAURANTE PAGE ====================
function RestaurantePage({ restId, onBack }: { restId: number; onBack: () => void }) {
  const [rest, setRest] = useState<Restaurante | null>(null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('monitor')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('todos')
  const [search, setSearch] = useState('')

  useEffect(() => { loadRestaurante() }, [restId])

  async function loadRestaurante() {
    setLoading(true)
    
    // Restaurante
    const { data: restData } = await supabase.from('restaurantes').select('*').eq('id', restId).single()
    
    // Categorias Geraldo
    const { data: catsData } = await supabase.from('categorias').select('*').eq('restaurante_id', restId).eq('origem', 'geraldo').order('nome')
    
    // Itens Geraldo com preços
    const { data: itensData } = await supabase.from('itens').select('*, categorias!inner(id, nome, restaurante_id, origem), precos(valor, tamanho_nome)')
      .eq('categorias.restaurante_id', restId)
      .eq('categorias.origem', 'geraldo')
      .order('nome')
    
    // Processar itens
    const processedItens: Item[] = (itensData || []).map((i: any) => {
      const precos = i.precos || []
      const temPreco = precos.some((p: any) => p.valor != null && p.valor > 0)
      return {
        id: i.id,
        nome: i.nome,
        descricao: i.descricao,
        imagem_url: i.imagem_url,
        origem: 'geraldo',
        origem_id: i.origem_id,
        categoria_id: i.categorias?.id,
        categoria_nome: i.categorias?.nome || '',
        restaurante_id: restId,
        restaurante_nome: restData?.nome || '',
        precos,
        sem_foto: !i.imagem_url,
        sem_desc: !i.descricao || i.descricao.trim() === '',
        sem_preco: !temPreco
      }
    })

    // Calcular stats por categoria
    const catMap = new Map<number, Categoria>()
    catsData?.forEach(c => {
      catMap.set(c.id, {
        ...c,
        total_itens: 0,
        sem_foto: 0,
        sem_desc: 0,
        sem_preco: 0
      })
    })

    processedItens.forEach(i => {
      const cat = catMap.get(i.categoria_id)
      if (cat) {
        cat.total_itens++
        if (i.sem_foto) cat.sem_foto++
        if (i.sem_desc) cat.sem_desc++
        if (i.sem_preco) cat.sem_preco++
      }
    })

    setRest({
      ...restData,
      total_cats: catsData?.length || 0,
      total_itens: processedItens.length,
      sem_foto: processedItens.filter(i => i.sem_foto).length,
      sem_desc: processedItens.filter(i => i.sem_desc).length,
      sem_preco: processedItens.filter(i => i.sem_preco).length
    })
    setCategorias(Array.from(catMap.values()))
    setItens(processedItens)
    setLoading(false)
  }

  // Filtrar itens
  const filteredItens = itens.filter(i => {
    const matchCat = selectedCat === null || i.categoria_id === selectedCat
    const matchSearch = i.nome.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'todos' ? true :
      filter === 'sem_foto' ? i.sem_foto :
      filter === 'sem_desc' ? i.sem_desc :
      i.sem_preco
    return matchCat && matchSearch && matchFilter
  })

  // Stats do filtro atual
  const filterStats = {
    total: filteredItens.length,
    sem_foto: filteredItens.filter(i => i.sem_foto).length,
    sem_desc: filteredItens.filter(i => i.sem_desc).length,
    sem_preco: filteredItens.filter(i => i.sem_preco).length
  }

  if (loading) return <div className="loading">Carregando...</div>
  if (!rest) return <div className="error">Restaurante não encontrado</div>

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn btn-ghost" onClick={onBack}>← Voltar</button>
          <div>
            <h2>{rest.nome}</h2>
            <p>ID: {rest.geraldo_id}</p>
          </div>
        </div>
        <div className="header-links">
          {rest.geraldo_link && <a href={rest.geraldo_link} target="_blank" className="btn btn-secondary">🔗 Geraldo</a>}
          {rest.vitrine_link && <a href={rest.vitrine_link} target="_blank" className="btn btn-secondary">🏪 Vitrine</a>}
        </div>
      </header>

      {/* KPIs do Restaurante */}
      <div className="kpi-row small">
        <div className="kpi"><div className="kpi-value">{rest.total_cats}</div><div className="kpi-label">Categorias</div></div>
        <div className="kpi"><div className="kpi-value">{rest.total_itens}</div><div className="kpi-label">Itens</div></div>
        <div className={`kpi ${filter === 'sem_foto' ? 'active' : ''}`} onClick={() => setFilter(filter === 'sem_foto' ? 'todos' : 'sem_foto')}>
          <div className={`kpi-value ${rest.sem_foto > 0 ? 'red' : 'green'}`}>{rest.sem_foto}</div><div className="kpi-label">Sem Foto</div>
        </div>
        <div className={`kpi ${filter === 'sem_desc' ? 'active' : ''}`} onClick={() => setFilter(filter === 'sem_desc' ? 'todos' : 'sem_desc')}>
          <div className={`kpi-value ${rest.sem_desc > 0 ? 'red' : 'green'}`}>{rest.sem_desc}</div><div className="kpi-label">Sem Desc</div>
        </div>
        <div className={`kpi ${filter === 'sem_preco' ? 'active' : ''}`} onClick={() => setFilter(filter === 'sem_preco' ? 'todos' : 'sem_preco')}>
          <div className={`kpi-value ${rest.sem_preco > 0 ? 'red' : 'green'}`}>{rest.sem_preco}</div><div className="kpi-label">Sem Preço</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab ${tab === 'monitor' ? 'active' : ''}`} onClick={() => setTab('monitor')}>⭐ Monitor Geraldo</div>
        <div className={`tab ${tab === 'itens' ? 'active' : ''}`} onClick={() => setTab('itens')}>📦 Itens</div>
        <div className={`tab ${tab === 'ifood' ? 'active' : ''}`} onClick={() => setTab('ifood')}>🍔 iFood (Preencher)</div>
        <div className={`tab ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>🔗 Matches</div>
      </div>

      {/* Tab Content */}
      {tab === 'monitor' && (
        <div className="monitor-layout">
          {/* Categorias */}
          <div className="categories-panel">
            <div className="panel-header">Categorias</div>
            <div className={`category-item ${selectedCat === null ? 'active' : ''}`} onClick={() => setSelectedCat(null)}>
              <span>Todas</span>
              <span className="cat-count">{itens.length}</span>
            </div>
            {categorias.map(c => (
              <div key={c.id} className={`category-item ${selectedCat === c.id ? 'active' : ''}`} onClick={() => setSelectedCat(c.id)}>
                <span>{c.nome}</span>
                <div className="cat-badges">
                  {c.sem_foto > 0 && <span className="mini-badge red">{c.sem_foto}📷</span>}
                  {c.sem_desc > 0 && <span className="mini-badge orange">{c.sem_desc}📝</span>}
                  {c.sem_preco > 0 && <span className="mini-badge yellow">{c.sem_preco}💰</span>}
                  {c.sem_foto === 0 && c.sem_desc === 0 && c.sem_preco === 0 && <span className="mini-badge green">✓</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Itens */}
          <div className="items-panel">
            <div className="panel-header">
              <span>Itens ({filterStats.total})</span>
              <input type="text" className="search-input small" placeholder="🔍 Buscar item..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            
            <div className="filter-chips small">
              <span className={`chip ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos ({filterStats.total})</span>
              <span className={`chip ${filter === 'sem_foto' ? 'active' : ''}`} onClick={() => setFilter('sem_foto')}>📷 Sem Foto ({filterStats.sem_foto})</span>
              <span className={`chip ${filter === 'sem_desc' ? 'active' : ''}`} onClick={() => setFilter('sem_desc')}>📝 Sem Desc ({filterStats.sem_desc})</span>
              <span className={`chip ${filter === 'sem_preco' ? 'active' : ''}`} onClick={() => setFilter('sem_preco')}>💰 Sem Preço ({filterStats.sem_preco})</span>
            </div>

            <div className="items-list">
              {filteredItens.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
              {filteredItens.length === 0 && <div className="empty">Nenhum item encontrado</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'itens' && (
        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th>Imagem</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Preço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredItens.map(item => (
                <tr key={item.id}>
                  <td>
                    {item.imagem_url ? (
                      <img src={item.imagem_url} alt="" className="item-thumb" />
                    ) : (
                      <div className="item-thumb placeholder">📷</div>
                    )}
                  </td>
                  <td><strong>{item.nome}</strong></td>
                  <td><span className="badge badge-neutral">{item.categoria_nome}</span></td>
                  <td className="desc-cell">{item.descricao || <span className="text-muted">Sem descrição</span>}</td>
                  <td>{item.precos.length > 0 ? `R$ ${item.precos[0]?.valor?.toFixed(2) || '-'}` : <span className="text-muted">Sem preço</span>}</td>
                  <td>
                    <div className="status-badges">
                      {item.sem_foto && <span className="badge badge-danger">📷</span>}
                      {item.sem_desc && <span className="badge badge-warning">📝</span>}
                      {item.sem_preco && <span className="badge badge-warning">💰</span>}
                      {!item.sem_foto && !item.sem_desc && !item.sem_preco && <span className="badge badge-success">✓ OK</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ifood' && (
        <div className="ifood-panel">
          <div className="panel-info">
            <h3>🍔 Preencher com iFood</h3>
            <p>Itens do Geraldo com lacunas que podem ser preenchidos com dados do iFood (quando houver match).</p>
          </div>
          <div className="items-list">
            {itens.filter(i => i.sem_foto || i.sem_desc || i.sem_preco).map(item => (
              <div key={item.id} className="ifood-item">
                <div className="ifood-item-left">
                  {item.imagem_url ? <img src={item.imagem_url} alt="" className="item-thumb" /> : <div className="item-thumb placeholder">📷</div>}
                  <div>
                    <strong>{item.nome}</strong>
                    <div className="status-badges">
                      {item.sem_foto && <span className="badge badge-danger">Sem foto</span>}
                      {item.sem_desc && <span className="badge badge-warning">Sem desc</span>}
                      {item.sem_preco && <span className="badge badge-warning">Sem preço</span>}
                    </div>
                  </div>
                </div>
                <div className="ifood-item-right">
                  <span className="text-muted">Match não configurado</span>
                </div>
              </div>
            ))}
            {itens.filter(i => i.sem_foto || i.sem_desc || i.sem_preco).length === 0 && (
              <div className="empty success">🎉 Todos os itens estão completos!</div>
            )}
          </div>
        </div>
      )}

      {tab === 'matches' && (
        <div className="matches-panel">
          <div className="panel-info">
            <h3>🔗 Matches Geraldo ↔ iFood</h3>
            <p>Gerencie os matches entre itens do Geraldo e iFood.</p>
          </div>
          <div className="empty">Matches serão carregados da tabela item_matches</div>
        </div>
      )}
    </div>
  )
}

// ==================== ITEM CARD ====================
function ItemCard({ item }: { item: Item }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`item-card ${item.sem_foto || item.sem_desc || item.sem_preco ? 'has-problem' : ''}`}>
      <div className="item-card-main" onClick={() => setExpanded(!expanded)}>
        <div className="item-thumb-container">
          {item.imagem_url ? (
            <img src={item.imagem_url} alt="" className="item-thumb" />
          ) : (
            <div className="item-thumb placeholder">📷</div>
          )}
        </div>
        <div className="item-info">
          <div className="item-name">{item.nome}</div>
          <div className="item-desc">{item.descricao || <span className="text-muted">Sem descrição</span>}</div>
          <div className="item-meta">
            <span className="badge badge-neutral">{item.categoria_nome}</span>
            {item.precos.length > 0 && item.precos[0]?.valor && (
              <span className="item-price">R$ {item.precos[0].valor.toFixed(2)}</span>
            )}
          </div>
        </div>
        <div className="item-flags">
          {item.sem_foto && <span className="flag red" title="Sem foto">📷</span>}
          {item.sem_desc && <span className="flag orange" title="Sem descrição">📝</span>}
          {item.sem_preco && <span className="flag yellow" title="Sem preço">💰</span>}
          {!item.sem_foto && !item.sem_desc && !item.sem_preco && <span className="flag green">✓</span>}
        </div>
      </div>
      
      {expanded && (
        <div className="item-card-expanded">
          <div className="item-actions">
            {item.imagem_url && <a href={item.imagem_url} target="_blank" className="btn btn-small">🔗 Ver imagem</a>}
            <button className="btn btn-small" onClick={() => navigator.clipboard.writeText(item.nome)}>📋 Copiar nome</button>
            {item.descricao && <button className="btn btn-small" onClick={() => navigator.clipboard.writeText(item.descricao!)}>📋 Copiar desc</button>}
          </div>
          {item.precos.length > 1 && (
            <div className="item-sizes">
              <strong>Tamanhos/Preços:</strong>
              {item.precos.map((p, i) => (
                <div key={i} className="size-row">
                  <span>{p.tamanho_nome || 'Padrão'}</span>
                  <span>{p.valor ? `R$ ${p.valor.toFixed(2)}` : <span className="text-muted">Sem preço</span>}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== ITENS PAGE (GLOBAL) ====================
function ItensPage() {
  const [itens, setItens] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [page, setPage] = useState(0)
  const pageSize = 50

  useEffect(() => { loadItens() }, [])

  async function loadItens() {
    setLoading(true)
    
    const { data } = await supabase.from('itens')
      .select('*, categorias!inner(id, nome, restaurante_id, origem, restaurantes(id, nome)), precos(valor, tamanho_nome)')
      .eq('categorias.origem', 'geraldo')
      .order('nome')
      .range(0, 999)

    const processedItens: Item[] = (data || []).map((i: any) => {
      const precos = i.precos || []
      const temPreco = precos.some((p: any) => p.valor != null && p.valor > 0)
      return {
        id: i.id,
        nome: i.nome,
        descricao: i.descricao,
        imagem_url: i.imagem_url,
        origem: 'geraldo',
        origem_id: i.origem_id,
        categoria_id: i.categorias?.id,
        categoria_nome: i.categorias?.nome || '',
        restaurante_id: i.categorias?.restaurantes?.id,
        restaurante_nome: i.categorias?.restaurantes?.nome || '',
        precos,
        sem_foto: !i.imagem_url,
        sem_desc: !i.descricao || i.descricao.trim() === '',
        sem_preco: !temPreco
      }
    })

    setItens(processedItens)
    setLoading(false)
  }

  // Filtrar
  const filtered = itens.filter(i => {
    const matchSearch = i.nome.toLowerCase().includes(search.toLowerCase()) || 
      i.restaurante_nome.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'todos' ? true :
      filter === 'sem_foto' ? i.sem_foto :
      filter === 'sem_desc' ? i.sem_desc :
      i.sem_preco
    return matchSearch && matchFilter
  })

  // Paginar
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(filtered.length / pageSize)

  // Stats
  const stats = {
    total: filtered.length,
    sem_foto: filtered.filter(i => i.sem_foto).length,
    sem_desc: filtered.filter(i => i.sem_desc).length,
    sem_preco: filtered.filter(i => i.sem_preco).length
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h2>Itens Global</h2>
          <p>Auditoria de todos os itens do sistema (Geraldo)</p>
        </div>
        <button className="btn btn-primary" onClick={loadItens}>🔄 Atualizar</button>
      </header>

      {/* KPIs */}
      <div className="kpi-row small">
        <div className={`kpi ${filter === 'todos' ? 'active' : ''}`} onClick={() => { setFilter('todos'); setPage(0) }}>
          <div className="kpi-value">{stats.total}</div><div className="kpi-label">Total</div>
        </div>
        <div className={`kpi ${filter === 'sem_foto' ? 'active' : ''}`} onClick={() => { setFilter('sem_foto'); setPage(0) }}>
          <div className={`kpi-value ${stats.sem_foto > 0 ? 'red' : 'green'}`}>{stats.sem_foto}</div><div className="kpi-label">Sem Foto</div>
        </div>
        <div className={`kpi ${filter === 'sem_desc' ? 'active' : ''}`} onClick={() => { setFilter('sem_desc'); setPage(0) }}>
          <div className={`kpi-value ${stats.sem_desc > 0 ? 'red' : 'green'}`}>{stats.sem_desc}</div><div className="kpi-label">Sem Desc</div>
        </div>
        <div className={`kpi ${filter === 'sem_preco' ? 'active' : ''}`} onClick={() => { setFilter('sem_preco'); setPage(0) }}>
          <div className={`kpi-value ${stats.sem_preco > 0 ? 'red' : 'green'}`}>{stats.sem_preco}</div><div className="kpi-label">Sem Preço</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters">
        <input type="text" className="search-input" placeholder="🔍 Buscar item ou restaurante..." value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        <div className="pagination">
          <button className="btn btn-small" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
          <span>Página {page + 1} de {totalPages || 1}</span>
          <button className="btn btn-small" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>→</button>
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="loading">Carregando...</div>
      ) : (
        <div className="items-table-container">
          <table className="items-table">
            <thead>
              <tr>
                <th>Imagem</th>
                <th>Nome</th>
                <th>Restaurante</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(item => (
                <tr key={item.id} className={item.sem_foto || item.sem_desc || item.sem_preco ? 'row-problem' : ''}>
                  <td>
                    {item.imagem_url ? (
                      <img src={item.imagem_url} alt="" className="item-thumb" />
                    ) : (
                      <div className="item-thumb placeholder">📷</div>
                    )}
                  </td>
                  <td><strong>{item.nome}</strong></td>
                  <td><span className="badge badge-info">{item.restaurante_nome}</span></td>
                  <td><span className="badge badge-neutral">{item.categoria_nome}</span></td>
                  <td>{item.precos.length > 0 && item.precos[0]?.valor ? `R$ ${item.precos[0].valor.toFixed(2)}` : <span className="text-muted">-</span>}</td>
                  <td>
                    <div className="status-badges">
                      {item.sem_foto && <span className="badge badge-danger">📷</span>}
                      {item.sem_desc && <span className="badge badge-warning">📝</span>}
                      {item.sem_preco && <span className="badge badge-warning">💰</span>}
                      {!item.sem_foto && !item.sem_desc && !item.sem_preco && <span className="badge badge-success">✓</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default App

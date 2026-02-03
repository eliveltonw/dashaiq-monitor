import { useState, useEffect, useMemo } from 'react'
import './index.css'

// ==================== CONFIG SUPABASE ====================
const API = 'https://xkbivbtvoyqnshqcyrol.supabase.co/rest/v1'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrYml2YnR2b3lxbnNocWN5cm9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkyMjQ1OCwiZXhwIjoyMDg1NDk4NDU4fQ.rqqPur_g_Sh_OY3vns8G8zfCBiG0cshPRqNHQP7qzdg'

const headers = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json'
}

async function query(table: string, params = '') {
  const res = await fetch(`${API}/${table}${params}`, { headers })
  return res.json()
}

// ==================== TYPES (ESTRUTURA REAL DO BANCO) ====================
interface Restaurante {
  id: number
  geraldo_id: number
  ifood_uuid: string | null
  nome: string
  avatar_url: string | null
  telefones: string | null
  celulares: string | null
  geraldo_link: string | null
  vitrine_link: string | null
  // Computed
  total_cats?: number
  total_itens?: number
  sem_foto?: number
  sem_desc?: number
  sem_preco?: number
}

interface Categoria {
  id: number
  restaurante_id: number
  origem: 'geraldo' | 'ifood'
  origem_id: string | null
  nome: string
  status: number
  // Computed
  total_itens?: number
  sem_foto?: number
  sem_desc?: number
  sem_preco?: number
}

interface Item {
  id: number
  categoria_id: number
  origem_id: string | null
  nome: string
  descricao: string | null
  imagem_url: string | null
  // Computed
  categoria_nome?: string
  restaurante_id?: number
  restaurante_nome?: string
  precos?: Preco[]
  sem_foto?: boolean
  sem_desc?: boolean
  sem_preco?: boolean
}

interface Preco {
  id: number
  item_id: number
  tamanho_nome: string | null
  valor: number | null
}

interface ItemMatch {
  id: number
  restaurante_id: number
  item_geraldo_id: number
  item_ifood_id: number | null
  confianca: number
  status: string
  match_por: string | null
}

type View = 'home' | 'restaurante' | 'itens'
type Tab = 'monitor' | 'itens' | 'ifood' | 'matches'
type Filter = 'todos' | 'sem_foto' | 'sem_desc' | 'sem_preco'

// ==================== APP ====================
function App() {
  const [view, setView] = useState<View>('home')
  const [selectedRestId, setSelectedRestId] = useState<number | null>(null)
  
  return (
    <div className="app">
      <Sidebar view={view} onNavigate={(v) => { setView(v); if (v === 'home') setSelectedRestId(null) }} />
      <main className="main">
        {view === 'home' && <HomePage onSelectRest={(id) => { setSelectedRestId(id); setView('restaurante') }} />}
        {view === 'restaurante' && selectedRestId && <RestaurantePage restId={selectedRestId} onBack={() => setView('home')} />}
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
        <div className="status">🟢 Conectado ao Supabase</div>
      </div>
    </aside>
  )
}

// ==================== HOME PAGE ====================
function HomePage({ onSelectRest }: { onSelectRest: (id: number) => void }) {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [precos, setPrecos] = useState<Preco[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'todos' | 'com_problema' | 'sem_ifood'>('todos')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [rests, cats, items, prices] = await Promise.all([
        query('restaurantes', '?order=nome'),
        query('categorias', '?origem=eq.geraldo'),
        query('itens'),
        query('precos')
      ])
      setRestaurantes(rests || [])
      setCategorias(cats || [])
      setItens(items || [])
      setPrecos(prices || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Calcular stats por restaurante
  const restComStats = useMemo(() => {
    const catMap = new Map<number, number[]>() // rest_id -> [cat_ids]
    categorias.forEach(c => {
      if (!catMap.has(c.restaurante_id)) catMap.set(c.restaurante_id, [])
      catMap.get(c.restaurante_id)!.push(c.id)
    })

    const itemsByCat = new Map<number, Item[]>()
    itens.forEach(i => {
      if (!itemsByCat.has(i.categoria_id)) itemsByCat.set(i.categoria_id, [])
      itemsByCat.get(i.categoria_id)!.push(i)
    })

    const precosByItem = new Map<number, Preco[]>()
    precos.forEach(p => {
      if (!precosByItem.has(p.item_id)) precosByItem.set(p.item_id, [])
      precosByItem.get(p.item_id)!.push(p)
    })

    return restaurantes.map(r => {
      const catIds = catMap.get(r.id) || []
      const restItens: Item[] = []
      catIds.forEach(catId => {
        const catItems = itemsByCat.get(catId) || []
        restItens.push(...catItems)
      })

      let sem_foto = 0, sem_desc = 0, sem_preco = 0
      restItens.forEach(item => {
        if (!item.imagem_url) sem_foto++
        if (!item.descricao || item.descricao.trim() === '') sem_desc++
        const itemPrecos = precosByItem.get(item.id) || []
        const temPreco = itemPrecos.some(p => p.valor != null && p.valor > 0)
        if (!temPreco) sem_preco++
      })

      return {
        ...r,
        total_cats: catIds.length,
        total_itens: restItens.length,
        sem_foto,
        sem_desc,
        sem_preco
      }
    })
  }, [restaurantes, categorias, itens, precos])

  // Stats globais
  const stats = useMemo(() => ({
    total: restComStats.length,
    sem_ifood: restComStats.filter(r => !r.ifood_uuid).length,
    sem_foto: restComStats.reduce((acc, r) => acc + (r.sem_foto || 0), 0),
    sem_desc: restComStats.reduce((acc, r) => acc + (r.sem_desc || 0), 0),
    sem_preco: restComStats.reduce((acc, r) => acc + (r.sem_preco || 0), 0)
  }), [restComStats])

  // Filtrar
  const filtered = restComStats.filter(r => {
    const matchSearch = r.nome.toLowerCase().includes(search.toLowerCase()) || r.geraldo_id.toString().includes(search)
    const matchFilter = filter === 'todos' ? true :
      filter === 'sem_ifood' ? !r.ifood_uuid :
      ((r.sem_foto || 0) > 0 || (r.sem_desc || 0) > 0 || (r.sem_preco || 0) > 0)
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
        <input type="text" className="search-input" placeholder="🔍 Buscar restaurante..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-chips">
          <span className={`chip ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos</span>
          <span className={`chip ${filter === 'com_problema' ? 'active' : ''}`} onClick={() => setFilter('com_problema')}>⚠️ Com Problema</span>
          <span className={`chip ${filter === 'sem_ifood' ? 'active' : ''}`} onClick={() => setFilter('sem_ifood')}>❌ Sem iFood</span>
        </div>
        <span className="filter-count">{filtered.length} restaurantes</span>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="loading">Carregando dados do Supabase...</div>
      ) : (
        <div className="restaurant-grid">
          {filtered.map(r => (
            <div key={r.id} className="restaurant-card" onClick={() => onSelectRest(r.id)}>
              <div className="card-header">
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt="" className="card-avatar-img" />
                ) : (
                  <div className="card-avatar">{r.nome.charAt(0)}</div>
                )}
                <div className="card-info">
                  <div className="card-name">{r.nome}</div>
                  <div className="card-id">Geraldo #{r.geraldo_id}</div>
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
                  <span className={`stat-value ${(r.sem_foto || 0) > 0 ? 'red' : 'green'}`}>{r.sem_foto || 0}</span>
                  <span className="stat-label">s/ Foto</span>
                </div>
                <div className="card-stat">
                  <span className={`stat-value ${(r.sem_desc || 0) > 0 ? 'red' : 'green'}`}>{r.sem_desc || 0}</span>
                  <span className="stat-label">s/ Desc</span>
                </div>
                <div className="card-stat">
                  <span className={`stat-value ${(r.sem_preco || 0) > 0 ? 'red' : 'green'}`}>{r.sem_preco || 0}</span>
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
  const [precos, setPrecos] = useState<Preco[]>([])
  const [matches, setMatches] = useState<ItemMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('monitor')
  const [selectedCat, setSelectedCat] = useState<number | null>(null)
  const [filter, setFilter] = useState<Filter>('todos')
  const [search, setSearch] = useState('')

  useEffect(() => { loadRestaurante() }, [restId])

  async function loadRestaurante() {
    setLoading(true)
    try {
      const [restData, catsData, matchesData] = await Promise.all([
        query('restaurantes', `?id=eq.${restId}`),
        query('categorias', `?restaurante_id=eq.${restId}&origem=eq.geraldo&order=nome`),
        query('item_matches', `?restaurante_id=eq.${restId}`)
      ])
      
      setRest(restData?.[0] || null)
      setCategorias(catsData || [])
      setMatches(matchesData || [])
      
      // Buscar itens das categorias
      if (catsData?.length > 0) {
        const catIds = catsData.map((c: Categoria) => c.id).join(',')
        const [itensData, precosData] = await Promise.all([
          query('itens', `?categoria_id=in.(${catIds})`),
          query('precos')
        ])
        setItens(itensData || [])
        setPrecos(precosData || [])
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Processar itens com flags
  const itensComFlags = useMemo(() => {
    const precosByItem = new Map<number, Preco[]>()
    precos.forEach(p => {
      if (!precosByItem.has(p.item_id)) precosByItem.set(p.item_id, [])
      precosByItem.get(p.item_id)!.push(p)
    })

    const catMap = new Map(categorias.map(c => [c.id, c.nome]))

    return itens.map(i => {
      const itemPrecos = precosByItem.get(i.id) || []
      const temPreco = itemPrecos.some(p => p.valor != null && p.valor > 0)
      return {
        ...i,
        categoria_nome: catMap.get(i.categoria_id) || '',
        precos: itemPrecos,
        sem_foto: !i.imagem_url,
        sem_desc: !i.descricao || i.descricao.trim() === '',
        sem_preco: !temPreco
      }
    })
  }, [itens, precos, categorias])

  // Stats por categoria
  const categoriasComStats = useMemo(() => {
    return categorias.map(c => {
      const catItens = itensComFlags.filter(i => i.categoria_id === c.id)
      return {
        ...c,
        total_itens: catItens.length,
        sem_foto: catItens.filter(i => i.sem_foto).length,
        sem_desc: catItens.filter(i => i.sem_desc).length,
        sem_preco: catItens.filter(i => i.sem_preco).length
      }
    })
  }, [categorias, itensComFlags])

  // Filtrar itens
  const filteredItens = itensComFlags.filter(i => {
    const matchCat = selectedCat === null || i.categoria_id === selectedCat
    const matchSearch = i.nome.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'todos' ? true :
      filter === 'sem_foto' ? i.sem_foto :
      filter === 'sem_desc' ? i.sem_desc :
      i.sem_preco
    return matchCat && matchSearch && matchFilter
  })

  // Stats do restaurante
  const restStats = useMemo(() => ({
    total_cats: categorias.length,
    total_itens: itensComFlags.length,
    sem_foto: itensComFlags.filter(i => i.sem_foto).length,
    sem_desc: itensComFlags.filter(i => i.sem_desc).length,
    sem_preco: itensComFlags.filter(i => i.sem_preco).length
  }), [categorias, itensComFlags])

  if (loading) return <div className="loading">Carregando restaurante...</div>
  if (!rest) return <div className="error">Restaurante não encontrado</div>

  return (
    <div className="page">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <button className="btn btn-ghost" onClick={onBack}>← Voltar</button>
          <div className="header-rest">
            {rest.avatar_url && <img src={rest.avatar_url} alt="" className="header-avatar" />}
            <div>
              <h2>{rest.nome}</h2>
              <p>Geraldo #{rest.geraldo_id} {rest.ifood_uuid && `• iFood: ${rest.ifood_uuid.slice(0,8)}...`}</p>
            </div>
          </div>
        </div>
        <div className="header-links">
          {rest.geraldo_link && <a href={rest.geraldo_link} target="_blank" className="btn btn-secondary">🔗 Geraldo</a>}
          {rest.vitrine_link && <a href={rest.vitrine_link} target="_blank" className="btn btn-secondary">🏪 Vitrine</a>}
        </div>
      </header>

      {/* KPIs */}
      <div className="kpi-row small">
        <div className="kpi"><div className="kpi-value">{restStats.total_cats}</div><div className="kpi-label">Categorias</div></div>
        <div className="kpi"><div className="kpi-value">{restStats.total_itens}</div><div className="kpi-label">Itens</div></div>
        <div className={`kpi ${filter === 'sem_foto' ? 'active' : ''}`} onClick={() => setFilter(f => f === 'sem_foto' ? 'todos' : 'sem_foto')}>
          <div className={`kpi-value ${restStats.sem_foto > 0 ? 'red' : 'green'}`}>{restStats.sem_foto}</div><div className="kpi-label">Sem Foto</div>
        </div>
        <div className={`kpi ${filter === 'sem_desc' ? 'active' : ''}`} onClick={() => setFilter(f => f === 'sem_desc' ? 'todos' : 'sem_desc')}>
          <div className={`kpi-value ${restStats.sem_desc > 0 ? 'red' : 'green'}`}>{restStats.sem_desc}</div><div className="kpi-label">Sem Desc</div>
        </div>
        <div className={`kpi ${filter === 'sem_preco' ? 'active' : ''}`} onClick={() => setFilter(f => f === 'sem_preco' ? 'todos' : 'sem_preco')}>
          <div className={`kpi-value ${restStats.sem_preco > 0 ? 'red' : 'green'}`}>{restStats.sem_preco}</div><div className="kpi-label">Sem Preço</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className={`tab ${tab === 'monitor' ? 'active' : ''}`} onClick={() => setTab('monitor')}>⭐ Monitor Geraldo</div>
        <div className={`tab ${tab === 'itens' ? 'active' : ''}`} onClick={() => setTab('itens')}>📦 Itens ({restStats.total_itens})</div>
        <div className={`tab ${tab === 'ifood' ? 'active' : ''}`} onClick={() => setTab('ifood')}>🍔 iFood (Preencher)</div>
        <div className={`tab ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>🔗 Matches ({matches.length})</div>
      </div>

      {/* Tab: Monitor Geraldo */}
      {tab === 'monitor' && (
        <div className="monitor-layout">
          <div className="categories-panel">
            <div className="panel-header">Categorias</div>
            <div className={`category-item ${selectedCat === null ? 'active' : ''}`} onClick={() => setSelectedCat(null)}>
              <span>Todas</span>
              <span className="cat-count">{itensComFlags.length}</span>
            </div>
            {categoriasComStats.map(c => (
              <div key={c.id} className={`category-item ${selectedCat === c.id ? 'active' : ''}`} onClick={() => setSelectedCat(c.id)}>
                <span className="cat-name">{c.nome}</span>
                <div className="cat-badges">
                  {c.sem_foto > 0 && <span className="mini-badge red">{c.sem_foto}📷</span>}
                  {c.sem_desc > 0 && <span className="mini-badge orange">{c.sem_desc}📝</span>}
                  {c.sem_preco > 0 && <span className="mini-badge yellow">{c.sem_preco}💰</span>}
                  {c.sem_foto === 0 && c.sem_desc === 0 && c.sem_preco === 0 && <span className="mini-badge green">✓</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="items-panel">
            <div className="panel-header">
              <span>Itens ({filteredItens.length})</span>
              <input type="text" className="search-input small" placeholder="🔍 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            
            <div className="filter-chips small">
              <span className={`chip ${filter === 'todos' ? 'active' : ''}`} onClick={() => setFilter('todos')}>Todos</span>
              <span className={`chip ${filter === 'sem_foto' ? 'active' : ''}`} onClick={() => setFilter('sem_foto')}>📷 Sem Foto</span>
              <span className={`chip ${filter === 'sem_desc' ? 'active' : ''}`} onClick={() => setFilter('sem_desc')}>📝 Sem Desc</span>
              <span className={`chip ${filter === 'sem_preco' ? 'active' : ''}`} onClick={() => setFilter('sem_preco')}>💰 Sem Preço</span>
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

      {/* Tab: Itens */}
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
                <tr key={item.id} className={item.sem_foto || item.sem_desc || item.sem_preco ? 'row-problem' : ''}>
                  <td>
                    {item.imagem_url ? <img src={item.imagem_url} alt="" className="item-thumb" /> : <div className="item-thumb placeholder">📷</div>}
                  </td>
                  <td><strong>{item.nome}</strong><br/><small className="text-muted">ID: {item.origem_id}</small></td>
                  <td><span className="badge badge-neutral">{item.categoria_nome}</span></td>
                  <td className="desc-cell">{item.descricao || <span className="text-muted">Sem descrição</span>}</td>
                  <td>{item.precos && item.precos.length > 0 ? item.precos.map((p, i) => <div key={i}>{p.tamanho_nome}: R$ {p.valor?.toFixed(2) || '-'}</div>) : <span className="text-muted">-</span>}</td>
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

      {/* Tab: iFood Preencher */}
      {tab === 'ifood' && (
        <div className="ifood-panel">
          <div className="panel-info">
            <h3>🍔 Preencher com iFood</h3>
            <p>Itens do Geraldo com lacunas que podem ser preenchidos com dados do iFood.</p>
          </div>
          <div className="items-list">
            {itensComFlags.filter(i => i.sem_foto || i.sem_desc || i.sem_preco).map(item => (
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
                  {matches.find(m => m.item_geraldo_id === item.id) ? (
                    <span className="badge badge-success">Match encontrado</span>
                  ) : (
                    <span className="text-muted">Sem match</span>
                  )}
                </div>
              </div>
            ))}
            {itensComFlags.filter(i => i.sem_foto || i.sem_desc || i.sem_preco).length === 0 && (
              <div className="empty success">🎉 Todos os itens estão completos!</div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Matches */}
      {tab === 'matches' && (
        <div className="matches-panel">
          <div className="panel-info">
            <h3>🔗 Matches Geraldo ↔ iFood</h3>
            <p>{matches.length} matches encontrados para este restaurante.</p>
          </div>
          {matches.length > 0 ? (
            <div className="matches-list">
              {matches.map(m => {
                const itemGeraldo = itensComFlags.find(i => i.id === m.item_geraldo_id)
                return (
                  <div key={m.id} className="match-item">
                    <div className="match-info">
                      <strong>{itemGeraldo?.nome || `Item #${m.item_geraldo_id}`}</strong>
                      <div className="match-details">
                        <span className={`badge ${m.confianca >= 90 ? 'badge-success' : 'badge-warning'}`}>{m.confianca}%</span>
                        <span className="badge badge-neutral">{m.status}</span>
                        <span className="badge badge-info">{m.match_por}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty">Nenhum match encontrado. Execute o script SQL para popular.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ==================== ITEM CARD ====================
function ItemCard({ item }: { item: Item & { precos?: Preco[]; sem_foto?: boolean; sem_desc?: boolean; sem_preco?: boolean; categoria_nome?: string } }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`item-card ${item.sem_foto || item.sem_desc || item.sem_preco ? 'has-problem' : ''}`}>
      <div className="item-card-main" onClick={() => setExpanded(!expanded)}>
        <div className="item-thumb-container">
          {item.imagem_url ? <img src={item.imagem_url} alt="" className="item-thumb" /> : <div className="item-thumb placeholder">📷</div>}
        </div>
        <div className="item-info">
          <div className="item-name">{item.nome}</div>
          <div className="item-desc">{item.descricao || <span className="text-muted">Sem descrição</span>}</div>
          <div className="item-meta">
            <span className="badge badge-neutral">{item.categoria_nome}</span>
            {item.precos && item.precos.length > 0 && item.precos[0]?.valor && (
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
          <div className="item-details">
            <p><strong>ID Origem:</strong> {item.origem_id}</p>
            <p><strong>Descrição:</strong> {item.descricao || 'Sem descrição'}</p>
          </div>
          <div className="item-actions">
            {item.imagem_url && <a href={item.imagem_url} target="_blank" className="btn btn-small">🔗 Ver imagem</a>}
            <button className="btn btn-small" onClick={() => navigator.clipboard.writeText(item.nome)}>📋 Copiar nome</button>
            {item.descricao && <button className="btn btn-small" onClick={() => navigator.clipboard.writeText(item.descricao!)}>📋 Copiar desc</button>}
          </div>
          {item.precos && item.precos.length > 0 && (
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
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [precos, setPrecos] = useState<Preco[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('todos')
  const [page, setPage] = useState(0)
  const pageSize = 50

  useEffect(() => { loadItens() }, [])

  async function loadItens() {
    setLoading(true)
    try {
      const [cats, items, rests, prices] = await Promise.all([
        query('categorias', '?origem=eq.geraldo'),
        query('itens'),
        query('restaurantes'),
        query('precos')
      ])
      setCategorias(cats || [])
      setItens(items || [])
      setRestaurantes(rests || [])
      setPrecos(prices || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  // Processar itens
  const itensProcessados = useMemo(() => {
    const catMap = new Map(categorias.map(c => [c.id, c]))
    const restMap = new Map(restaurantes.map(r => [r.id, r]))
    const precosByItem = new Map<number, Preco[]>()
    precos.forEach(p => {
      if (!precosByItem.has(p.item_id)) precosByItem.set(p.item_id, [])
      precosByItem.get(p.item_id)!.push(p)
    })

    return itens.filter(i => {
      const cat = catMap.get(i.categoria_id)
      return cat && cat.origem === 'geraldo'
    }).map(i => {
      const cat = catMap.get(i.categoria_id)
      const rest = cat ? restMap.get(cat.restaurante_id) : null
      const itemPrecos = precosByItem.get(i.id) || []
      const temPreco = itemPrecos.some(p => p.valor != null && p.valor > 0)
      return {
        ...i,
        categoria_nome: cat?.nome || '',
        restaurante_id: cat?.restaurante_id,
        restaurante_nome: rest?.nome || '',
        precos: itemPrecos,
        sem_foto: !i.imagem_url,
        sem_desc: !i.descricao || i.descricao.trim() === '',
        sem_preco: !temPreco
      }
    })
  }, [itens, categorias, restaurantes, precos])

  // Filtrar
  const filtered = itensProcessados.filter(i => {
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
          <p>Auditoria de todos os itens Geraldo do sistema</p>
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
        <div className="loading">Carregando itens do Supabase...</div>
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
                    {item.imagem_url ? <img src={item.imagem_url} alt="" className="item-thumb" /> : <div className="item-thumb placeholder">📷</div>}
                  </td>
                  <td><strong>{item.nome}</strong></td>
                  <td><span className="badge badge-info">{item.restaurante_nome}</span></td>
                  <td><span className="badge badge-neutral">{item.categoria_nome}</span></td>
                  <td>{item.precos && item.precos.length > 0 && item.precos[0]?.valor ? `R$ ${item.precos[0].valor.toFixed(2)}` : <span className="text-muted">-</span>}</td>
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

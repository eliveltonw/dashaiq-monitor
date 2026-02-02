import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { Home, Store, Tag, RefreshCw, Download, Eye, Settings } from 'lucide-react'
import './App.css'

interface Restaurante {
  id: number
  geraldo_id: number
  nome: string
  ifood_uuid: string | null
  created_at: string
  categorias_count?: number
  itens_count?: number
}

interface Stats {
  restaurantes: number
  categorias: number
  itens: number
  precos: number
}

function App() {
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [stats, setStats] = useState<Stats>({ restaurantes: 0, categorias: 0, itens: 0, precos: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [showCookieModal, setShowCookieModal] = useState(false)
  const [cookieValue, setCookieValue] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Carregar restaurantes
      const { data: rests, error: restError } = await supabase
        .from('restaurantes')
        .select('*')
        .order('nome')

      if (restError) throw restError
      
      // Carregar contagens
      const { count: catCount } = await supabase.from('categorias').select('*', { count: 'exact', head: true })
      const { count: itemCount } = await supabase.from('itens').select('*', { count: 'exact', head: true })
      const { count: precoCount } = await supabase.from('precos').select('*', { count: 'exact', head: true })

      setRestaurantes(rests || [])
      setStats({
        restaurantes: rests?.length || 0,
        categorias: catCount || 0,
        itens: itemCount || 0,
        precos: precoCount || 0
      })
    } catch (err) {
      console.error('Erro ao carregar dados:', err)
    }
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    // Aqui vai chamar a API de sync quando estiver na nuvem
    // Por enquanto só recarrega os dados
    await loadData()
    setSyncing(false)
  }

  function handleExportCSV() {
    const csv = [
      ['ID', 'Geraldo ID', 'Nome', 'iFood UUID', 'Criado em'].join(','),
      ...restaurantes.map(r => [
        r.id,
        r.geraldo_id,
        `"${r.nome}"`,
        r.ifood_uuid || '',
        r.created_at
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `restaurantes_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const filteredRestaurantes = restaurantes.filter(r => 
    r.nome.toLowerCase().includes(search.toLowerCase()) ||
    r.geraldo_id.toString().includes(search)
  )

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <Home size={20} />
          </div>
          <div className="header-title">
            <h1>DashAIQ</h1>
            <p>Monitor de Cardápios iFood ↔ Geraldo</p>
          </div>
        </div>

        <div className="header-stats">
          <span><Store size={16} /> {stats.restaurantes} restaurantes</span>
          <span><Tag size={16} /> {stats.categorias} categorias</span>
          <span><Tag size={16} /> {stats.itens} itens</span>
        </div>

        <div className="header-actions">
          <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? 'spinning' : ''} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowCookieModal(true)}>
            <Settings size={16} />
            Cookie Geraldo
          </button>
          <button className="btn btn-secondary" onClick={handleExportCSV}>
            <Download size={16} />
            Exportar CSV
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="main">
        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Restaurantes</span>
              <div className="stat-icon blue"><Store size={18} /></div>
            </div>
            <div className="stat-value">{stats.restaurantes}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Categorias</span>
              <div className="stat-icon green"><Tag size={18} /></div>
            </div>
            <div className="stat-value">{stats.categorias}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Total Itens</span>
              <div className="stat-icon green"><Tag size={18} /></div>
            </div>
            <div className="stat-value">{stats.itens}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Preços</span>
              <div className="stat-icon green"><Tag size={18} /></div>
            </div>
            <div className="stat-value">{stats.precos}</div>
          </div>

          <div className="stat-card warning">
            <div className="stat-header">
              <span className="stat-label">Só Geraldo</span>
              <div className="stat-icon yellow"><Tag size={18} /></div>
            </div>
            <div className="stat-value">
              {restaurantes.filter(r => !r.ifood_uuid).length}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Só iFood</span>
              <div className="stat-icon yellow"><Tag size={18} /></div>
            </div>
            <div className="stat-value">0</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Sincronizados</span>
              <div className="stat-icon green"><Tag size={18} /></div>
            </div>
            <div className="stat-value">
              {restaurantes.filter(r => r.ifood_uuid).length}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className="tab active">
            <Store size={16} />
            Restaurantes
            <span className="tab-count">{stats.restaurantes}</span>
          </button>
          <button className="tab">
            <Tag size={16} />
            Itens
            <span className="tab-count">{stats.itens}</span>
          </button>
        </div>

        {/* Filters */}
        <div className="filters">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar restaurante..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="toggle">
            <input type="checkbox" />
            <span>Somente com pendências</span>
          </div>
          <span className="pagination">
            1-{filteredRestaurantes.length} de {stats.restaurantes}
          </span>
        </div>

        {/* Table */}
        <div className="table-container">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              Carregando...
            </div>
          ) : filteredRestaurantes.length === 0 ? (
            <div className="empty-state">
              <h3>Nenhum restaurante encontrado</h3>
              <p>Rode o sync_database.py para importar os JSONs</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Restaurante</th>
                  <th>Geraldo ID</th>
                  <th>iFood</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRestaurantes.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div className="restaurant-name">{r.nome}</div>
                      <div className="restaurant-id">ID: {r.id}</div>
                    </td>
                    <td>{r.geraldo_id}</td>
                    <td>
                      {r.ifood_uuid ? (
                        <span className="badge badge-success">✓ Vinculado</span>
                      ) : (
                        <span className="badge badge-warning">Pendente</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-success">Ativo</span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-action">
                        <Eye size={14} />
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Cookie Modal */}
      {showCookieModal && (
        <div className="modal-overlay" onClick={() => setShowCookieModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>🍪 Cookie do Geraldo</h2>
            <p style={{ marginBottom: 16, color: '#6b7280' }}>
              Cole o conteúdo do storage_state.json ou os cookies de sessão do Geraldo
            </p>
            <textarea 
              placeholder='{"cookies": [...]}'
              value={cookieValue}
              onChange={e => setCookieValue(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCookieModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => {
                localStorage.setItem('geraldo_cookies', cookieValue)
                setShowCookieModal(false)
                alert('Cookie salvo!')
              }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

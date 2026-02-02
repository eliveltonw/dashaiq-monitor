import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { 
  Store, Package, AlertTriangle, CheckCircle, XCircle,
  Search, RefreshCw, Eye, Check, Link2, Unlink,
  BarChart3, Layers, ChevronLeft
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
  matched: number
  pending: number
}

interface ItemGeraldo {
  id: number
  nome: string
  descricao: string
  categoria_id: number
  categoria_nome: string
  preco: number
}

interface ItemIfood {
  id: number
  nome: string
  descricao: string
  categoria_id: number
  categoria_nome: string
  preco: number
}

interface Match {
  id?: number
  item_geraldo_id: number
  item_ifood_id: number | null
  confianca: number
  status: string
  match_por: string
  geraldo: ItemGeraldo
  ifood: ItemIfood | null
}

type View = 'dashboard' | 'restaurantes' | 'matching'
type FilterStatus = 'todos' | 'ok' | 'pendente'

// Função de similaridade
function similarity(s1: string, s2: string): number {
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  const a = normalize(s1), b = normalize(s2)
  if (a === b) return 100
  
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  
  if (longer.length === 0) return 100
  
  // Levenshtein simplificado
  const costs: number[] = []
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) costs[j] = j
      else if (j > 0) {
        let newValue = costs[j - 1]
        if (shorter[i - 1] !== longer[j - 1])
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
        costs[j - 1] = lastValue
        lastValue = newValue
      }
    }
    if (i > 0) costs[longer.length] = lastValue
  }
  
  return Math.round((1 - costs[longer.length] / longer.length) * 100)
}

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [restaurantes, setRestaurantes] = useState<Restaurante[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('todos')
  
  // Matching state
  const [selectedRest, setSelectedRest] = useState<Restaurante | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [savingMatch, setSavingMatch] = useState<number | null>(null)
  const [filterMatch, setFilterMatch] = useState<'todos' | '100' | 'pendente' | 'sem'>('todos')

  const [stats, setStats] = useState({
    restaurantes: 0,
    itens_geraldo: 0,
    itens_ifood: 0,
    matched: 0,
    pending: 0
  })

  useEffect(() => { loadRestaurantes() }, [])

  async function loadRestaurantes() {
    setLoading(true)
    const { data: rests } = await supabase.from('restaurantes').select('*').order('nome')
    const { data: cats } = await supabase.from('categorias').select('restaurante_id, origem')
    const { data: items } = await supabase.from('itens').select('categoria_id, categorias(restaurante_id, origem)')
    const { data: matchesData } = await supabase.from('item_matches').select('restaurante_id, status')

    const map = new Map<number, Restaurante>()
    rests?.forEach(r => map.set(r.id, { ...r, cats_geraldo: 0, cats_ifood: 0, itens_geraldo: 0, itens_ifood: 0, matched: 0, pending: 0 }))

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

    matchesData?.forEach(m => {
      const r = map.get(m.restaurante_id)
      if (r) {
        if (m.status === 'confirmado' || m.status === 'auto') r.matched++
        else r.pending++
      }
    })

    const lista = Array.from(map.values())
    setRestaurantes(lista)
    
    const totalMatched = lista.reduce((a, r) => a + r.matched, 0)
    const totalItensG = lista.reduce((a, r) => a + r.itens_geraldo, 0)
    const totalItensI = lista.reduce((a, r) => a + r.itens_ifood, 0)
    
    setStats({
      restaurantes: lista.length,
      itens_geraldo: totalItensG,
      itens_ifood: totalItensI,
      matched: totalMatched,
      pending: totalItensG - totalMatched
    })
    setLoading(false)
  }

  async function openMatching(rest: Restaurante) {
    setSelectedRest(rest)
    setView('matching')
    setLoadingMatches(true)
    setFilterMatch('todos')

    // Buscar itens Geraldo
    const { data: catsG } = await supabase.from('categorias').select('id, nome').eq('restaurante_id', rest.id).eq('origem', 'geraldo')
    const catGIds = catsG?.map(c => c.id) || []
    const catGMap = new Map(catsG?.map(c => [c.id, c.nome]))

    let itensGeraldo: ItemGeraldo[] = []
    if (catGIds.length) {
      const { data } = await supabase.from('itens').select('*, precos(valor)').in('categoria_id', catGIds)
      itensGeraldo = data?.map((i: any) => ({
        id: i.id,
        nome: i.nome,
        descricao: i.descricao || '',
        categoria_id: i.categoria_id,
        categoria_nome: catGMap.get(i.categoria_id) || '',
        preco: i.precos?.[0]?.valor || 0
      })) || []
    }

    // Buscar itens iFood
    const { data: catsI } = await supabase.from('categorias').select('id, nome').eq('restaurante_id', rest.id).eq('origem', 'ifood')
    const catIIds = catsI?.map(c => c.id) || []
    const catIMap = new Map(catsI?.map(c => [c.id, c.nome]))

    let itensIfood: ItemIfood[] = []
    if (catIIds.length) {
      const { data } = await supabase.from('itens').select('*, precos(valor)').in('categoria_id', catIIds)
      itensIfood = data?.map((i: any) => ({
        id: i.id,
        nome: i.nome,
        descricao: i.descricao || '',
        categoria_id: i.categoria_id,
        categoria_nome: catIMap.get(i.categoria_id) || '',
        preco: i.precos?.[0]?.valor || 0
      })) || []
    }

    // Buscar matches existentes
    const { data: existingMatches } = await supabase.from('item_matches').select('*').eq('restaurante_id', rest.id)
    const matchMap = new Map(existingMatches?.map(m => [m.item_geraldo_id, m]))

    // Criar lista de matches
    const matchList: Match[] = itensGeraldo.map(g => {
      const existing = matchMap.get(g.id)
      
      if (existing) {
        const ifoodItem = itensIfood.find(i => i.id === existing.item_ifood_id)
        return {
          id: existing.id,
          item_geraldo_id: g.id,
          item_ifood_id: existing.item_ifood_id,
          confianca: existing.confianca,
          status: existing.status,
          match_por: existing.match_por,
          geraldo: g,
          ifood: ifoodItem || null
        }
      }

      // Tentar auto-match
      let bestMatch: ItemIfood | null = null
      let bestScore = 0
      let matchPor = ''

      for (const ifood of itensIfood) {
        // Mesmo nome de categoria
        const catSim = similarity(g.categoria_nome, ifood.categoria_nome)
        const nomeSim = similarity(g.nome, ifood.nome)
        
        let score = 0
        let por = ''

        if (catSim >= 80 && nomeSim === 100) {
          score = 100
          por = 'nome+cat'
        } else if (catSim >= 80 && nomeSim >= 90) {
          score = 95
          por = 'nome+cat'
        } else if (catSim >= 80 && nomeSim >= 80) {
          const precoMatch = Math.abs(g.preco - ifood.preco) < 1
          score = precoMatch ? 90 : 85
          por = precoMatch ? 'nome+cat+preco' : 'nome+cat'
        } else if (nomeSim >= 95) {
          score = 80
          por = 'nome'
        } else if (catSim >= 80 && nomeSim >= 60) {
          score = 70
          por = 'nome+cat'
        }

        if (score > bestScore) {
          bestScore = score
          bestMatch = ifood
          matchPor = por
        }
      }

      return {
        item_geraldo_id: g.id,
        item_ifood_id: bestMatch?.id || null,
        confianca: bestScore,
        status: bestScore >= 90 ? 'auto' : 'pendente',
        match_por: matchPor,
        geraldo: g,
        ifood: bestMatch
      }
    })

    // Ordenar: pendentes primeiro, depois por confiança
    matchList.sort((a, b) => {
      if (a.status === 'pendente' && b.status !== 'pendente') return -1
      if (a.status !== 'pendente' && b.status === 'pendente') return 1
      return a.confianca - b.confianca
    })

    setMatches(matchList)
    setLoadingMatches(false)
  }

  async function saveMatch(match: Match, newStatus: string) {
    setSavingMatch(match.item_geraldo_id)
    
    if (match.id) {
      // Update
      await supabase.from('item_matches').update({
        status: newStatus,
        updated_at: new Date().toISOString()
      }).eq('id', match.id)
    } else {
      // Insert
      await supabase.from('item_matches').insert({
        restaurante_id: selectedRest!.id,
        item_geraldo_id: match.item_geraldo_id,
        item_ifood_id: match.item_ifood_id,
        confianca: match.confianca,
        status: newStatus,
        match_por: match.match_por
      })
    }

    // Atualizar local
    setMatches(prev => prev.map(m => 
      m.item_geraldo_id === match.item_geraldo_id 
        ? { ...m, status: newStatus }
        : m
    ))
    setSavingMatch(null)
  }

  async function saveAllAuto() {
    const autoMatches = matches.filter(m => m.confianca >= 90 && m.status !== 'confirmado')
    
    for (const match of autoMatches) {
      await saveMatch(match, 'confirmado')
    }
    
    await loadRestaurantes()
  }

  async function unlinkMatch(match: Match) {
    setSavingMatch(match.item_geraldo_id)
    
    if (match.id) {
      await supabase.from('item_matches').update({
        item_ifood_id: null,
        confianca: 0,
        status: 'sem_match',
        updated_at: new Date().toISOString()
      }).eq('id', match.id)
    } else {
      await supabase.from('item_matches').insert({
        restaurante_id: selectedRest!.id,
        item_geraldo_id: match.item_geraldo_id,
        item_ifood_id: null,
        confianca: 0,
        status: 'sem_match',
        match_por: 'manual'
      })
    }

    setMatches(prev => prev.map(m => 
      m.item_geraldo_id === match.item_geraldo_id 
        ? { ...m, item_ifood_id: null, ifood: null, confianca: 0, status: 'sem_match' }
        : m
    ))
    setSavingMatch(null)
  }

  // Filtros
  const filtered = restaurantes.filter(r => {
    const matchSearch = r.nome.toLowerCase().includes(search.toLowerCase()) || r.geraldo_id.toString().includes(search)
    const matchStatus = filterStatus === 'todos' ||
      (filterStatus === 'ok' && r.matched >= r.itens_geraldo * 0.9) ||
      (filterStatus === 'pendente' && r.matched < r.itens_geraldo * 0.9)
    return matchSearch && matchStatus
  })

  const filteredMatches = matches.filter(m => {
    if (filterMatch === 'todos') return true
    if (filterMatch === '100') return m.confianca === 100 || m.status === 'confirmado'
    if (filterMatch === 'pendente') return m.confianca > 0 && m.confianca < 100 && m.status !== 'confirmado'
    if (filterMatch === 'sem') return m.confianca === 0 || m.status === 'sem_match'
    return true
  })

  const matchStats = {
    total: matches.length,
    confirmados: matches.filter(m => m.status === 'confirmado' || (m.status === 'auto' && m.confianca >= 90)).length,
    pendentes: matches.filter(m => m.confianca > 0 && m.confianca < 90 && m.status !== 'confirmado').length,
    sem: matches.filter(m => m.confianca === 0 || m.status === 'sem_match').length
  }

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
          </div>

          <div className="nav-section">
            <div className="nav-section-title">Status Matching</div>
            <div className="nav-item">
              <CheckCircle size={18} /> Matched
              <span className="nav-item-badge">{stats.matched}</span>
            </div>
            <div className="nav-item">
              <AlertTriangle size={18} /> Pendentes
              <span className="nav-item-badge">{stats.pending}</span>
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sync-status"><div className="sync-dot"></div>Banco conectado</div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            {view === 'matching' && (
              <button className="btn btn-ghost" onClick={() => { setView('restaurantes'); setSelectedRest(null) }}>
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="header-title">
              <h2>{view === 'dashboard' ? 'Dashboard' : view === 'restaurantes' ? 'Restaurantes' : selectedRest?.nome}</h2>
              <p>{view === 'matching' ? `ID: ${selectedRest?.geraldo_id} • Matching de Itens` : 'Visão completa do seu cardápio'}</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={loadRestaurantes}><RefreshCw size={16} /> Atualizar</button>
          </div>
        </header>

        {/* Content */}
        <div className="content">
          {loading ? (
            <div className="loading"><div className="spinner"></div> Carregando...</div>
          ) : view === 'dashboard' ? (
            <>
              <div className="stats-row">
                <div className="stat-card clickable" onClick={() => setView('restaurantes')}>
                  <div className="stat-header"><div className="stat-icon orange"><Store size={20} /></div></div>
                  <div className="stat-value">{stats.restaurantes}</div>
                  <div className="stat-label">Restaurantes</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon blue"><Package size={20} /></div></div>
                  <div className="stat-value">{stats.itens_geraldo.toLocaleString()}</div>
                  <div className="stat-label">Itens Geraldo</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon red"><Package size={20} /></div></div>
                  <div className="stat-value">{stats.itens_ifood.toLocaleString()}</div>
                  <div className="stat-label">Itens iFood</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon green"><Link2 size={20} /></div></div>
                  <div className="stat-value">{stats.matched.toLocaleString()}</div>
                  <div className="stat-label">Matches Feitos</div>
                  <div className="stat-sub">{stats.itens_geraldo > 0 ? ((stats.matched / stats.itens_geraldo) * 100).toFixed(0) : 0}% do total</div>
                </div>
                <div className="stat-card">
                  <div className="stat-header"><div className="stat-icon yellow"><AlertTriangle size={20} /></div></div>
                  <div className="stat-value">{stats.pending.toLocaleString()}</div>
                  <div className="stat-label">Pendentes</div>
                </div>
              </div>

              <div className="table-container">
                <div className="table-header"><h3>Restaurantes para Validar</h3></div>
                <table>
                  <thead>
                    <tr><th>Restaurante</th><th>Itens G</th><th>Itens iF</th><th>Matched</th><th>Progresso</th><th></th></tr>
                  </thead>
                  <tbody>
                    {restaurantes.filter(r => r.matched < r.itens_geraldo).slice(0, 10).map(r => (
                      <tr key={r.id}>
                        <td><div className="cell-main">{r.nome}</div><div className="cell-sub">ID: {r.geraldo_id}</div></td>
                        <td><span className="badge badge-info">{r.itens_geraldo}</span></td>
                        <td><span className="badge badge-danger badge-sm">{r.itens_ifood}</span></td>
                        <td><span className="badge badge-success">{r.matched}</span></td>
                        <td style={{ width: 150 }}>
                          <div className="progress-bar">
                            <div className="progress-fill green" style={{ width: `${r.itens_geraldo > 0 ? (r.matched / r.itens_geraldo) * 100 : 0}%` }}></div>
                          </div>
                        </td>
                        <td><button className="btn btn-primary btn-sm" onClick={() => openMatching(r)}><Link2 size={14} /> Match</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : view === 'restaurantes' ? (
            <>
              <div className="filters-bar">
                <div className="search-box">
                  <Search size={18} />
                  <input placeholder="Buscar restaurante..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="filter-chips">
                  {(['todos', 'ok', 'pendente'] as FilterStatus[]).map(f => (
                    <div key={f} className={`chip ${filterStatus === f ? 'active' : ''}`} onClick={() => setFilterStatus(f)}>
                      {f === 'todos' && <Layers size={14} />}
                      {f === 'ok' && <CheckCircle size={14} />}
                      {f === 'pendente' && <AlertTriangle size={14} />}
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="table-container">
                <div className="table-header"><h3>{filtered.length} restaurantes</h3></div>
                <table>
                  <thead>
                    <tr><th>Restaurante</th><th>Itens Geraldo</th><th>Itens iFood</th><th>Matched</th><th>Progresso</th><th></th></tr>
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
                        <td><span className="badge badge-success">{r.matched}</span> / {r.itens_geraldo}</td>
                        <td style={{ width: 150 }}>
                          <div className="progress-bar">
                            <div className={`progress-fill ${r.matched >= r.itens_geraldo ? 'green' : r.matched > r.itens_geraldo * 0.5 ? 'yellow' : 'red'}`} 
                                 style={{ width: `${r.itens_geraldo > 0 ? (r.matched / r.itens_geraldo) * 100 : 0}%` }}></div>
                          </div>
                        </td>
                        <td><button className="btn btn-primary btn-sm" onClick={() => openMatching(r)}><Link2 size={14} /> Match</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : view === 'matching' && selectedRest ? (
            <>
              {/* Match Stats */}
              <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-value">{matchStats.total}</div>
                  <div className="stat-label">Total Itens</div>
                </div>
                <div className="stat-card" style={{ borderColor: 'var(--success)' }}>
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{matchStats.confirmados}</div>
                  <div className="stat-label">✓ Confirmados</div>
                </div>
                <div className="stat-card" style={{ borderColor: 'var(--warning)' }}>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{matchStats.pendentes}</div>
                  <div className="stat-label">⚠ Pendentes</div>
                </div>
                <div className="stat-card" style={{ borderColor: 'var(--danger)' }}>
                  <div className="stat-value" style={{ color: 'var(--danger)' }}>{matchStats.sem}</div>
                  <div className="stat-label">✗ Sem Match</div>
                </div>
              </div>

              {/* Filters & Actions */}
              <div className="filters-bar">
                <div className="filter-chips">
                  <div className={`chip ${filterMatch === 'todos' ? 'active' : ''}`} onClick={() => setFilterMatch('todos')}>
                    Todos <span className="chip-count">{matchStats.total}</span>
                  </div>
                  <div className={`chip ${filterMatch === '100' ? 'active' : ''}`} onClick={() => setFilterMatch('100')}>
                    <CheckCircle size={14} /> 100% <span className="chip-count">{matchStats.confirmados}</span>
                  </div>
                  <div className={`chip ${filterMatch === 'pendente' ? 'active' : ''}`} onClick={() => setFilterMatch('pendente')}>
                    <AlertTriangle size={14} /> Pendente <span className="chip-count">{matchStats.pendentes}</span>
                  </div>
                  <div className={`chip ${filterMatch === 'sem' ? 'active' : ''}`} onClick={() => setFilterMatch('sem')}>
                    <XCircle size={14} /> Sem Match <span className="chip-count">{matchStats.sem}</span>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={saveAllAuto}>
                  <Check size={16} /> Confirmar Automáticos ({matches.filter(m => m.confianca >= 90 && m.status !== 'confirmado').length})
                </button>
              </div>

              {/* Match List */}
              {loadingMatches ? (
                <div className="loading"><div className="spinner"></div> Processando matching...</div>
              ) : (
                <div className="match-list">
                  {filteredMatches.map(m => (
                    <div key={m.item_geraldo_id} className={`match-row ${m.status === 'confirmado' ? 'confirmed' : m.confianca >= 90 ? 'auto' : m.confianca > 0 ? 'pending' : 'nomatch'}`}>
                      {/* Geraldo Side */}
                      <div className="match-side geraldo">
                        <div className="match-badge">🟠 GERALDO</div>
                        <div className="match-item-name">{m.geraldo.nome}</div>
                        <div className="match-item-details">
                          <span className="match-cat">{m.geraldo.categoria_nome}</span>
                          <span className="match-price">R$ {m.geraldo.preco.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Confiança */}
                      <div className="match-center">
                        <div className={`match-score ${m.confianca === 100 || m.status === 'confirmado' ? 'score-100' : m.confianca >= 90 ? 'score-90' : m.confianca >= 70 ? 'score-70' : 'score-0'}`}>
                          {m.status === 'confirmado' ? '✓' : m.confianca > 0 ? `${m.confianca}%` : '✗'}
                        </div>
                        {m.match_por && <div className="match-por">{m.match_por}</div>}
                        <div className="match-actions">
                          {m.status !== 'confirmado' && m.confianca > 0 && (
                            <button className="btn btn-sm btn-success" onClick={() => saveMatch(m, 'confirmado')} disabled={savingMatch === m.item_geraldo_id}>
                              <Check size={14} />
                            </button>
                          )}
                          {m.ifood && (
                            <button className="btn btn-sm btn-ghost" onClick={() => unlinkMatch(m)} disabled={savingMatch === m.item_geraldo_id}>
                              <Unlink size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* iFood Side */}
                      <div className="match-side ifood">
                        {m.ifood ? (
                          <>
                            <div className="match-badge">🔴 IFOOD</div>
                            <div className="match-item-name">{m.ifood.nome}</div>
                            <div className="match-item-details">
                              <span className="match-cat">{m.ifood.categoria_nome}</span>
                              <span className="match-price">R$ {m.ifood.preco.toFixed(2)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="match-empty">
                            <XCircle size={24} />
                            <span>Sem match encontrado</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  )
}

export default App

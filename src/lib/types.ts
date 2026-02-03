export interface Restaurante {
  id: number
  geraldo_id: number
  nome: string
  ifood_uuid: string | null
  geraldo_link: string | null
  vitrine_link: string | null
  ifood_link: string | null
  // Computed
  total_categorias?: number
  total_itens?: number
  itens_sem_foto?: number
  itens_sem_desc?: number
  itens_sem_preco?: number
}

export interface Categoria {
  id: number
  restaurante_id: number
  nome: string
  origem: 'geraldo' | 'ifood'
  origem_id: string | null
  // Computed
  total_itens?: number
  itens_sem_foto?: number
  itens_sem_desc?: number
  itens_sem_preco?: number
}

export interface Item {
  id: number
  categoria_id: number
  nome: string
  descricao: string | null
  imagem_url: string | null
  origem: 'geraldo' | 'ifood'
  origem_id: string | null
  // Computed
  categoria_nome?: string
  restaurante_id?: number
  restaurante_nome?: string
  preco_min?: number
  preco_max?: number
  tem_preco?: boolean
  // Flags
  sem_foto?: boolean
  sem_desc?: boolean
  sem_preco?: boolean
}

export interface Preco {
  id: number
  item_id: number
  valor: number | null
  tamanho_nome: string | null
}

export interface ItemMatch {
  id: number
  restaurante_id: number
  item_geraldo_id: number
  item_ifood_id: number | null
  confianca: number
  status: 'auto' | 'confirmado' | 'rejeitado' | 'sem_match'
  match_por: string | null
  updated_at: string
}

export type FilterStatus = 'todos' | 'com_problema' | 'sem_ifood'
export type Tab = 'monitor' | 'itens' | 'ifood' | 'matches'

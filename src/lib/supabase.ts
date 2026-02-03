import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xkbivbtvoyqnshqcyrol.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrYml2YnR2b3lxbnNocWN5cm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczNTM0NTksImV4cCI6MjA2MjkyOTQ1OX0.d_dXE4vceY50k1Lw-ElrCnxBQSPrXf7BWLQ5ocq0Z2o'

export const supabase = createClient(supabaseUrl, supabaseKey)

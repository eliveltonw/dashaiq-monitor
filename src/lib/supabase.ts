import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xkbivbtvoyqnshqcyrol.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrYml2YnR2b3lxbnNocWN5cm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5MjI0NTgsImV4cCI6MjA4NTQ5ODQ1OH0.Xi1eZYuCkZtKKoXlhocF1CpwyebpJDcvhGX5ou7kEu4'

export const supabase = createClient(supabaseUrl, supabaseKey)

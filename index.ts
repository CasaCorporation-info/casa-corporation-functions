import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  
  try {
    const { record } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!apiKey || !supabaseUrl || !supabaseKey) throw new Error("Configurazione mancante nei Secrets.")

    // Costruzione del Prompt Professionale
    const prompt = `
      Sei un esperto Valutatore Immobiliare Senior per Casa Corporation. 
      Analizza i seguenti dati per una stima commerciale professionale:
      - Indirizzo: ${record.indirizzo}, ${record.comune} (${record.quartiere_zona})
      - Superficie: ${record.mq_commerciali}mq
      - Stato Interno: ${record.stato_interno}
      - Piano: ${record.piano_immobile} (Ascensore: ${record.ha_ascensore ? 'Sì' : 'No'})
      
      Restituisci ESCLUSIVAMENTE un JSON con questo formato:
      {"min": numero_intero, "max": numero_intero, "analisi": "testo professionale di 150 parole"}
    `;

    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json" } // Forza Gemini a rispondere in JSON
      })
    })

    const data = await response.json()
    const content = JSON.parse(data.candidates[0].content.parts[0].text)

    const supabase = createClient(supabaseUrl, supabaseKey)
    await supabase.from('valutazioni').update({ 
      valutazione_min: content.min, 
      valutazione_max: content.max, 
      report_generato: content.analisi, 
      status: 'completato' 
    }).eq('id', record.id)

    return new Response(JSON.stringify({ success: true }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    })
  }
})

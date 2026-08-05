import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Tratamento de CORS para chamadas do frontend se necessário
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Inicializa o cliente Supabase com a Service Role Key (necessária para bypass de RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    console.log("Iniciando processamento de agendas diárias...")

    // 1. Buscar todas as clínicas que possuem WhatsApp configurado (Instance ID é o mínimo)
    const { data: clinics, error: clinicError } = await supabase
      .from('clinics')
      .select('id, name, whatsapp_api_url, whatsapp_api_key, whatsapp_instance_id')
      .not('whatsapp_instance_id', 'is', null)

    if (clinicError) throw clinicError
    if (!clinics || clinics.length === 0) {
      return new Response(JSON.stringify({ message: "Nenhuma clínica com WhatsApp configurado." }), { status: 200 })
    }

    const results = []

    for (const clinic of clinics) {
      // 2. Buscar especialistas da clínica que querem receber a agenda
      // Filtramos por roles 'doctor' e 'owner' e pelo campo que criamos 'daily_agenda_notify'
      const { data: specialists, error: specError } = await supabase
        .from('users')
        .select('id, name, phone')
        .eq('clinic_id', clinic.id)
        .eq('daily_agenda_notify', true)
        .in('role', ['doctor', 'owner', 'admin'])

      if (specError || !specialists) continue

      for (const specialist of specialists) {
        if (!specialist.phone) {
          console.log(`Especialista ${specialist.name} não possui telefone cadastrado.`);
          continue
        }

        // 3. Buscar agendamentos de HOJE para este especialista
        // Ajustamos para o timezone de Brasília (GMT-3) se necessário, aqui usamos o dia atual UTC
        const today = new Date().toISOString().split('T')[0]
        
        const { data: appointments, error: appError } = await supabase
          .from('appointments')
          .select('*, patients(name)')
          .eq('doctor_id', specialist.id)
          .gte('start_time', `${today}T00:00:00`)
          .lte('start_time', `${today}T23:59:59`)
          .in('status', ['pending', 'confirmed']) // Apenas agendamentos válidos
          .order('start_time', { ascending: true })

        if (appError || !appointments || appointments.length === 0) {
          console.log(`Médico ${specialist.name} não tem agendamentos para hoje.`);
          continue
        }

        // 4. Formatar a mensagem de forma elegante
        let message = `*AGENDA DO DIA - SOLARA CONNECT*\n\n`
        message += `Bom dia, Dr(a). *${specialist.name}*!\n`
        message += `Aqui está sua lista de pacientes para hoje (${new Date().toLocaleDateString('pt-BR')}):\n\n`

        appointments.forEach((app: any, index: number) => {
          const startTime = new Date(app.start_time);
          // Ajuste básico para PT-BR (Brasília)
          const time = startTime.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo' 
          })
          
          message += `${index + 1}. ⏰ *${time}* - ${app.patients?.name || 'Paciente'}\n`
          if (app.type) message += `   └ _${app.type}_\n`
        })

        message += `\n_Tenha um ótimo dia de trabalho!_ 🚀\n`
        message += `*Solara Connect* - Inteligência na sua Clínica`

        // 5. Enviar via Evolution API (cada clínica com sua URL e Key)
        const evoUrl = clinic.whatsapp_api_url || 'https://evoapi.axoshub.com'
        const evoKey = clinic.whatsapp_api_key
        const instance = clinic.whatsapp_instance_id

        // Limpa o número para garantir apenas dígitos
        const cleanNumber = specialist.phone.replace(/\D/g, '')
        const formattedNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`

        try {
          const response = await fetch(`${evoUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': evoKey || ''
            },
            body: JSON.stringify({
              number: formattedNumber,
              text: message
            })
          })

          const resData = await response.json()
          results.push({
            specialist: specialist.name,
            clinic: clinic.name,
            success: response.ok,
            evolution_response: resData
          })
        } catch (e) {
          console.error(`Erro ao enviar para ${specialist.name}:`, e.message)
          results.push({ specialist: specialist.name, clinic: clinic.name, error: e.message })
        }
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error("Erro fatal na função:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

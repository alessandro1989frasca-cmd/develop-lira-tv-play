import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org/bot';

interface TelegramMessage {
  message_id: number;
  from: { id: number; first_name: string; username?: string };
  chat: { id: number; type: string };
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

async function sendMessage(botToken: string, chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

function extractUrl(text: string): string | null {
  const urlRegex = /https?:\/\/[^\s]+/i;
  const match = text.match(urlRegex);
  return match ? match[0] : null;
}

function removeUrl(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/gi, '').trim();
}

const HELP_TEXT = `<b>🔴 Bot Lira TV - Breaking News</b>

Comandi disponibili:

<b>📢 Pubblica notizia urgente:</b>
Scrivi direttamente il titolo (e opzionalmente un link nella stessa riga o su una nuova riga)

<i>Esempio:</i>
<code>Terremoto in Campania: scossa di 4.2
https://www.ansa.it/articolo123</code>

<b>/lista</b> — Mostra le notizie urgenti attive
<b>/stop [ID]</b> — Disattiva una notizia (es: /stop 3)
<b>/aiuto</b> — Mostra questo messaggio

<i>Solo gli utenti autorizzati possono usare questo bot.</i>`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('OK', { status: 200 });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const allowedChatIds = Deno.env.get('TELEGRAM_ALLOWED_CHAT_IDS') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!botToken) {
    return new Response('Bot token not configured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const message = update.message;
  if (!message?.text) {
    return new Response('OK', { status: 200 });
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Controlla se il chat ID è autorizzato
  const allowed = allowedChatIds
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (allowed.length > 0 && !allowed.includes(String(chatId))) {
    await sendMessage(botToken, chatId, '⛔ Non sei autorizzato ad usare questo bot.');
    return new Response('OK', { status: 200 });
  }

  // Comando /aiuto o /start
  if (text === '/aiuto' || text === '/start' || text === '/help') {
    await sendMessage(botToken, chatId, HELP_TEXT);
    return new Response('OK', { status: 200 });
  }

  // Comando /lista
  if (text === '/lista') {
    const { data, error } = await supabase
      .from('breaking_news')
      .select('id, titolo, attiva, created_at')
      .eq('attiva', true)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      await sendMessage(botToken, chatId, '📭 Nessuna notizia urgente attiva al momento.');
    } else {
      const list = data
        .map(n => `🔴 [ID: ${n.id}] ${n.titolo}`)
        .join('\n');
      await sendMessage(botToken, chatId, `<b>Notizie urgenti attive:</b>\n\n${list}\n\n<i>Usa /stop [ID] per disattivarne una</i>`);
    }
    return new Response('OK', { status: 200 });
  }

  // Comando /stop [ID]
  if (text.startsWith('/stop')) {
    const parts = text.split(' ');
    const id = parseInt(parts[1] ?? '', 10);
    if (isNaN(id)) {
      await sendMessage(botToken, chatId, '⚠️ Specifica l\'ID della notizia da disattivare.\nEsempio: <code>/stop 3</code>');
      return new Response('OK', { status: 200 });
    }

    const { error } = await supabase
      .from('breaking_news')
      .update({ attiva: false })
      .eq('id', id);

    if (error) {
      await sendMessage(botToken, chatId, `❌ Errore durante la disattivazione della notizia ${id}.`);
    } else {
      await sendMessage(botToken, chatId, `✅ Notizia ID ${id} disattivata. Non sarà più visibile nell'app.`);
    }
    return new Response('OK', { status: 200 });
  }

  // Qualsiasi altro testo → crea breaking news
  if (text.startsWith('/')) {
    await sendMessage(botToken, chatId, '❓ Comando non riconosciuto. Usa /aiuto per vedere i comandi disponibili.');
    return new Response('OK', { status: 200 });
  }

  const url = extractUrl(text);
  const titolo = removeUrl(text).replace(/\n+/g, ' ').trim();

  if (!titolo) {
    await sendMessage(botToken, chatId, '⚠️ Testo vuoto. Scrivi il titolo della notizia urgente.');
    return new Response('OK', { status: 200 });
  }

  const { data, error } = await supabase
    .from('breaking_news')
    .insert({ titolo, descrizione: '', url: url ?? null, attiva: true })
    .select('id')
    .single();

  if (error || !data) {
    await sendMessage(botToken, chatId, '❌ Errore durante la pubblicazione. Riprova.');
    console.error('Supabase insert error:', JSON.stringify(error));
  } else {
    const preview = url ? `\n🔗 ${url}` : '';
    await sendMessage(
      botToken,
      chatId,
      `✅ <b>Breaking news pubblicata!</b>\n\n🔴 ${titolo}${preview}\n\n<i>ID: ${data.id} — Usa /stop ${data.id} per disattivarla</i>`
    );
  }

  return new Response('OK', { status: 200 });
});

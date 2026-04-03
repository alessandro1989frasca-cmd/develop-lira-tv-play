import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: {
    id: number;
    titolo: string;
    descrizione: string | null;
    url: string | null;
    attiva: boolean;
  };
  old_record: null | {
    attiva: boolean;
  };
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'high' | 'normal';
  channelId?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { record, type, old_record } = payload;

  const isNewActive =
    type === 'INSERT' && record.attiva === true;

  const isJustActivated =
    type === 'UPDATE' &&
    record.attiva === true &&
    old_record?.attiva === false;

  if (!isNewActive && !isJustActivated) {
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('enabled', true);

  if (tokensError || !tokens || tokens.length === 0) {
    console.log('No push tokens found or error:', tokensError);
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages: ExpoPushMessage[] = tokens
    .filter((row) => row.token.startsWith('ExponentPushToken['))
    .map((row) => ({
      to: row.token,
      title: `🔴 BREAKING - Lira TV`,
      body: record.titolo,
      data: { url: record.url ?? null, id: record.id },
      sound: 'default',
      priority: 'high',
      channelId: 'urgent-news',
    }));

  if (messages.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no valid expo tokens' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  let totalSent = 0;
  for (const chunk of chunks) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(chunk),
    });

    if (res.ok) {
      totalSent += chunk.length;
    } else {
      console.error('Expo push error:', await res.text());
    }
  }

  console.log(`Notifiche inviate: ${totalSent}/${messages.length}`);

  return new Response(JSON.stringify({ sent: totalSent, total: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

import 'dotenv/config';
import { Resend } from 'resend';

console.log('clé chargée =', (process.env.VITE_RESEND_API_KEY || '').slice(0,8)); // debug rapide

const resend = new Resend(process.env.VITE_RESEND_API_KEY);

const result = await resend.emails.send({
  from: 'Keepintouch <onboarding@resend.dev>',   // expéditeur de test autorisé
  to: 'benjamin@18avenue.fr',                     // ← mets TON adresse ici
  subject: 'Test Resend (onboarding) ✅',
  html: '<p>Si tu reçois ceci, l’API fonctionne bien.</p>',
  reply_to: 'notification@18avenue.fr'
});

console.log('Résultat:', result);

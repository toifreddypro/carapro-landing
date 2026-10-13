// ═══════════════════════════════════════════════════════════
// CaraLink Artisans — Edge Function : soumettre-commande
// Propriété : TOI Freddy
//
// FONCTION DÉSACTIVÉE (13/10).
//
// Cette ancienne fonction enregistrait une commande publique d'un seul article, SANS paiement
// en ligne et sans vérifier que l'artisan avait un compte Stripe actif. Depuis la décision
// « aucune commande sans paiement en ligne », elle contournait la règle : n'importe qui pouvait
// l'appeler directement et créer une commande non payée (stock retiré, email envoyé à l'artisan).
//
// Toutes les commandes passent désormais par soumettre-commande-panier (boutique), qui exige le
// compte Stripe actif et le paiement avant que la commande n'apparaisse chez l'artisan.
//
// La fonction reste déployée (des pages anciennement chargées peuvent encore l'appeler) mais
// elle ne lit, n'écrit et n'envoie plus rien : elle répond simplement « 410 — utilisez la boutique ».
// ═══════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MSG_DESACTIVEE = "Les commandes se font désormais depuis la boutique de l'artisan, avec paiement en ligne. Rechargez la page puis cliquez sur « Voir toute la boutique ».";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: MSG_DESACTIVEE }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

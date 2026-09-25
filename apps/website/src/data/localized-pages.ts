export const supportedLocales = ['es', 'fr', 'it'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export type PilotPageKey = 'home' | 'products' | 'shopifySeo';

export const pilotRoutes: Record<PilotPageKey, string> = {
  home: '/',
  products: '/products/',
  shopifySeo: '/shopify/seo/',
};

type Page = {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  answer: string;
  section: string;
  cards: Array<{ title: string; text: string }>;
};

type LocaleContent = {
  label: string;
  productsLabel: string;
  seoLabel: string;
  action: string;
  pages: Record<PilotPageKey, Page>;
};

export const localizedPages: Record<SupportedLocale, LocaleContent> = {
  es: {
    label: 'Español', productsLabel: 'Productos', seoLabel: 'SEO para Shopify', action: 'Ver productos',
    pages: {
      home: { title:'Klyna: herramientas de crecimiento para ecommerce', description:'Herramientas modernas para SEO, crecimiento y operaciones de Shopify y WordPress.', eyebrow:'Herramientas abiertas para crecer', heading:'Herramientas claras para que tu trabajo se encuentre y funcione mejor.', lead:'Klyna crea aplicaciones de Shopify, plugins de WordPress y utilidades de crecimiento sin cuentas obligatorias ni APIs de pago en la configuración predeterminada.', answer:'Klyna es un estudio de productos en beta. Cada herramienta explica su función, su estado y sus límites para que los equipos puedan probarla sin promesas infladas.', section:'Empieza por el flujo que quieres mejorar.', cards:[{title:'SEO y descubrimiento',text:'Revisa metadatos, schema, enlaces internos y problemas de indexación con flujos verificables.'},{title:'Conversión en Shopify',text:'Trabaja con bundles, reposición, reseñas, carrito y promociones sin perder de vista rendimiento y datos.'},{title:'Operaciones de contenido',text:'Convierte auditorías y hallazgos técnicos en tareas pequeñas que se puedan comprobar antes de publicar.'}] },
      products: { title:'Productos Klyna para Shopify y WordPress', description:'Explora las aplicaciones, plugins, temas y herramientas beta de Klyna.', eyebrow:'Catálogo de productos', heading:'Una familia de herramientas para ecommerce, contenido y crecimiento.', lead:'Cada producto se centra en un flujo concreto y comparte una base técnica que reduce duplicación, dependencias y trabajo de mantenimiento.', answer:'Los productos están en distintas fases beta. Revisa la página de cada herramienta y la documentación antes de usarla en una tienda o sitio de producción.', section:'Tres grupos para encontrar la herramienta adecuada.', cards:[{title:'Aplicaciones de Shopify',text:'SEO, bundles, reposición, reseñas, feeds, promociones y control de scripts para tiendas.'},{title:'Plugins de WordPress',text:'Velocidad, formularios, reseñas, analítica, redirecciones y SEO para sitios administrables.'},{title:'Temas y utilidades',text:'Bases visuales y herramientas de inspección para equipos que necesitan un flujo más simple.'}] },
      shopifySeo: { title:'Aplicación SEO para Shopify | Klyna SEO', description:'Klyna SEO ayuda a revisar metadatos, schema y oportunidades de enlaces en tiendas Shopify.', eyebrow:'Aplicación SEO para Shopify · Beta', heading:'Revisa el SEO de Shopify sin convertirlo en otro panel complicado.', lead:'Klyna SEO reúne comprobaciones prácticas para títulos, descripciones, datos estructurados y enlaces internos dentro de un flujo que el equipo puede validar.', answer:'La aplicación no garantiza posiciones ni sustituye Search Console. Ayuda a detectar oportunidades y riesgos; cada cambio debe comprobarse en la tienda publicada.', section:'Un flujo de SEO que mantiene el control humano.', cards:[{title:'Metadatos visibles',text:'Relaciona títulos y descripciones con el contenido real y la intención de cada página.'},{title:'Schema con contexto',text:'Detecta conflictos y evita añadir datos estructurados que no están respaldados por la página.'},{title:'Enlaces internos útiles',text:'Conecta productos, colecciones y guías cuando el enlace ayuda al visitante a continuar.'}] }
    }
  },
  fr: {
    label:'Français', productsLabel:'Produits', seoLabel:'SEO Shopify', action:'Voir les produits',
    pages: {
      home:{title:'Klyna : outils de croissance pour le e-commerce',description:'Outils modernes pour le SEO, la croissance et les opérations Shopify et WordPress.',eyebrow:'Des outils ouverts pour grandir',heading:'Des outils clairs pour rendre votre travail visible et plus efficace.',lead:'Klyna crée des applications Shopify, des extensions WordPress et des utilitaires de croissance sans compte obligatoire ni API payante dans la configuration par défaut.',answer:'Klyna est un studio de produits en bêta. Chaque outil présente sa fonction, son état et ses limites afin que les équipes puissent le tester sans promesses excessives.',section:'Commencez par le flux à améliorer.',cards:[{title:'SEO et découverte',text:'Contrôlez métadonnées, schema, liens internes et indexation avec des étapes vérifiables.'},{title:'Conversion Shopify',text:'Travaillez bundles, réassort, avis, panier et promotions sans ignorer performance et données.'},{title:'Opérations éditoriales',text:'Transformez audits et problèmes techniques en petites tâches contrôlables avant publication.'}]},
      products:{title:'Produits Klyna pour Shopify et WordPress',description:'Découvrez les applications, plugins, thèmes et outils bêta de Klyna.',eyebrow:'Catalogue de produits',heading:'Une famille d’outils pour le e-commerce, le contenu et la croissance.',lead:'Chaque produit répond à un flux précis et partage une base technique qui réduit la duplication, les dépendances et la maintenance.',answer:'Les produits se trouvent à différents stades bêta. Consultez la page et la documentation de chaque outil avant une utilisation en production.',section:'Trois groupes pour choisir le bon outil.',cards:[{title:'Applications Shopify',text:'SEO, bundles, réassort, avis, flux, promotions et contrôle des scripts pour boutiques.'},{title:'Extensions WordPress',text:'Vitesse, formulaires, avis, analytics, redirections et SEO pour des sites faciles à gérer.'},{title:'Thèmes et utilitaires',text:'Fondations visuelles et outils d’inspection pour simplifier le travail des équipes.'}]},
      shopifySeo:{title:'Application SEO Shopify | Klyna SEO',description:'Klyna SEO aide à contrôler métadonnées, schema et liens internes dans les boutiques Shopify.',eyebrow:'Application SEO Shopify · Bêta',heading:'Contrôlez le SEO Shopify sans ajouter un tableau de bord compliqué.',lead:'Klyna SEO réunit des vérifications utiles pour titres, descriptions, données structurées et liens internes dans un flux que l’équipe peut valider.',answer:'L’application ne garantit aucun classement et ne remplace pas Search Console. Elle signale opportunités et risques; chaque modification doit être vérifiée sur la boutique publiée.',section:'Un flux SEO qui garde l’humain aux commandes.',cards:[{title:'Métadonnées visibles',text:'Alignez titres et descriptions sur le contenu réel et l’intention de chaque page.'},{title:'Schema avec contexte',text:'Repérez les conflits et évitez les données structurées non justifiées par la page.'},{title:'Liens internes utiles',text:'Reliez produits, collections et guides lorsque le lien aide réellement le visiteur.'}]}
    }
  },
  it: {
    label:'Italiano', productsLabel:'Prodotti', seoLabel:'SEO Shopify', action:'Vedi i prodotti',
    pages: {
      home:{title:'Klyna: strumenti di crescita per ecommerce',description:'Strumenti moderni per SEO, crescita e operazioni Shopify e WordPress.',eyebrow:'Strumenti aperti per crescere',heading:'Strumenti chiari per rendere il tuo lavoro più visibile ed efficace.',lead:'Klyna crea app Shopify, plugin WordPress e strumenti di crescita senza account obbligatori o API a pagamento nella configurazione predefinita.',answer:'Klyna è uno studio di prodotti in beta. Ogni strumento dichiara funzione, stato e limiti affinché i team possano provarlo senza promesse esagerate.',section:'Parti dal flusso che vuoi migliorare.',cards:[{title:'SEO e scoperta',text:'Controlla metadati, schema, link interni e indicizzazione con passaggi verificabili.'},{title:'Conversione Shopify',text:'Gestisci bundle, riassortimento, recensioni, carrello e promozioni considerando prestazioni e dati.'},{title:'Operazioni sui contenuti',text:'Trasforma audit e problemi tecnici in attività piccole da verificare prima della pubblicazione.'}]},
      products:{title:'Prodotti Klyna per Shopify e WordPress',description:'Esplora app, plugin, temi e strumenti beta di Klyna.',eyebrow:'Catalogo prodotti',heading:'Una famiglia di strumenti per ecommerce, contenuti e crescita.',lead:'Ogni prodotto risolve un flusso specifico e condivide una base tecnica che riduce duplicazione, dipendenze e manutenzione.',answer:'I prodotti si trovano in diverse fasi beta. Controlla la pagina e la documentazione di ogni strumento prima di usarlo in produzione.',section:'Tre gruppi per trovare lo strumento adatto.',cards:[{title:'App Shopify',text:'SEO, bundle, riassortimento, recensioni, feed, promozioni e controllo script per negozi.'},{title:'Plugin WordPress',text:'Velocità, moduli, recensioni, analytics, redirect e SEO per siti gestibili.'},{title:'Temi e utilità',text:'Basi visive e strumenti di ispezione per semplificare il lavoro dei team.'}]},
      shopifySeo:{title:'App SEO per Shopify | Klyna SEO',description:'Klyna SEO aiuta a controllare metadati, schema e link interni nei negozi Shopify.',eyebrow:'App SEO Shopify · Beta',heading:'Controlla il SEO di Shopify senza aggiungere un pannello complicato.',lead:'Klyna SEO riunisce verifiche pratiche per titoli, descrizioni, dati strutturati e link interni in un flusso che il team può validare.',answer:'L’app non garantisce posizioni e non sostituisce Search Console. Evidenzia opportunità e rischi; ogni modifica deve essere verificata sul negozio pubblicato.',section:'Un flusso SEO che mantiene il controllo umano.',cards:[{title:'Metadati visibili',text:'Allinea titoli e descrizioni al contenuto reale e all’intento di ogni pagina.'},{title:'Schema con contesto',text:'Trova conflitti ed evita dati strutturati non supportati dalla pagina.'},{title:'Link interni utili',text:'Collega prodotti, collezioni e guide quando il link aiuta davvero il visitatore.'}]}
    }
  }
};

export function localeAlternates(route: string) {
  return {
    en: `https://klyna.dev${route}`,
    es: `https://klyna.dev/es${route}`,
    fr: `https://klyna.dev/fr${route}`,
    it: `https://klyna.dev/it${route}`,
    'x-default': `https://klyna.dev${route}`,
  };
}

export interface DeepLinkResult {
  app: string;
  scheme: string;
  fallback: string;
  webUrl: string;
  displayName: string;
  prefillText?: string;
  action?: "message" | "search" | "compose" | "navigate" | "open";
}

interface AppDef {
  displayName: string;
  category: string;
  aliases: string[];
  /** iOS URL scheme (also used on Android when schemeAndroid is absent) */
  scheme: string;
  /** Android-specific scheme when it differs from iOS */
  schemeAndroid?: string;
  fallback: string;
  webUrl: string;
  supportsText?: boolean;
  supportsSearch?: boolean;
}

// ─── Registry (50+ apps, iOS + Android) ──────────────────────────────────────

const APP_REGISTRY: Record<string, AppDef> = {

  // ── Messaging / Communication ─────────────────────────────────────────────
  whatsapp: {
    displayName: "WhatsApp", category: "messaging",
    aliases: ["whatsapp", "whats app", "wa"],
    scheme: "whatsapp://send?text=[TEXT]",
    schemeAndroid: "intent://send?text=[TEXT]#Intent;scheme=whatsapp;package=com.whatsapp;end",
    fallback: "https://wa.me/?text=[TEXT]",
    webUrl: "https://wa.me/?text=[TEXT]",
    supportsText: true,
  },
  telegram: {
    displayName: "Telegram", category: "messaging",
    aliases: ["telegram"],
    scheme: "tg://msg?text=[TEXT]",
    fallback: "https://t.me/share/url?text=[TEXT]",
    webUrl: "https://t.me/share/url?text=[TEXT]",
    supportsText: true,
  },
  signal: {
    displayName: "Signal", category: "messaging",
    aliases: ["signal"],
    scheme: "sgnl://compose?text=[TEXT]",
    schemeAndroid: "intent://compose?text=[TEXT]#Intent;scheme=sgnl;package=org.thoughtcrime.securesms;end",
    fallback: "https://signal.me",
    webUrl: "https://signal.org",
    supportsText: true,
  },
  messenger: {
    displayName: "Messenger", category: "messaging",
    aliases: ["messenger", "facebook messenger", "fb messenger"],
    scheme: "fb-messenger://",
    schemeAndroid: "intent://conversation#Intent;scheme=fb-messenger;package=com.facebook.orca;end",
    fallback: "fb-messenger://",
    webUrl: "https://messenger.com",
  },
  sms: {
    displayName: "SMS / Messages", category: "messaging",
    aliases: ["sms", "text message", "imessage", "messages app", "text"],
    scheme: "sms:?body=[TEXT]",
    fallback: "sms:?body=[TEXT]",
    webUrl: "sms:?body=[TEXT]",
    supportsText: true,
  },
  email: {
    displayName: "Email", category: "messaging",
    aliases: ["email", "mail", "e-mail"],
    scheme: "mailto:?body=[TEXT]",
    fallback: "mailto:?body=[TEXT]",
    webUrl: "mailto:?body=[TEXT]",
    supportsText: true,
  },
  gmail: {
    displayName: "Gmail", category: "messaging",
    aliases: ["gmail", "google mail"],
    scheme: "googlegmail://co?subject=[SUBJECT]&body=[TEXT]",
    schemeAndroid: "intent://compose?to=&subject=[SUBJECT]&body=[TEXT]#Intent;scheme=mailto;package=com.google.android.gm;end",
    fallback: "mailto:?subject=[SUBJECT]&body=[TEXT]",
    webUrl: "https://mail.google.com/mail/?view=cm&body=[TEXT]",
    supportsText: true,
  },
  outlook: {
    displayName: "Outlook", category: "messaging",
    aliases: ["outlook", "microsoft outlook", "ms outlook"],
    scheme: "ms-outlook://compose?body=[TEXT]",
    fallback: "mailto:?body=[TEXT]",
    webUrl: "https://outlook.live.com/mail/deeplink/compose?body=[TEXT]",
    supportsText: true,
  },
  slack: {
    displayName: "Slack", category: "messaging",
    aliases: ["slack"],
    scheme: "slack://",
    fallback: "slack://",
    webUrl: "https://app.slack.com",
    supportsText: true,
  },
  teams: {
    displayName: "Microsoft Teams", category: "messaging",
    aliases: ["teams", "microsoft teams", "ms teams"],
    scheme: "msteams://",
    fallback: "msteams://",
    webUrl: "https://teams.microsoft.com",
  },
  discord: {
    displayName: "Discord", category: "messaging",
    aliases: ["discord"],
    scheme: "discord://",
    fallback: "discord://",
    webUrl: "https://discord.com/app",
  },
  viber: {
    displayName: "Viber", category: "messaging",
    aliases: ["viber"],
    scheme: "viber://forward?text=[TEXT]",
    schemeAndroid: "intent://forward?text=[TEXT]#Intent;scheme=viber;package=com.viber.voip;end",
    fallback: "https://invite.viber.com",
    webUrl: "https://viber.com",
    supportsText: true,
  },
  line: {
    displayName: "LINE", category: "messaging",
    aliases: ["line app", "line messenger"],
    scheme: "line://msg/text/[TEXT]",
    schemeAndroid: "intent://msg/text/[TEXT]#Intent;scheme=line;package=jp.naver.line.android;end",
    fallback: "https://line.me",
    webUrl: "https://line.me",
    supportsText: true,
  },
  skype: {
    displayName: "Skype", category: "messaging",
    aliases: ["skype"],
    scheme: "skype://",
    fallback: "skype://",
    webUrl: "https://web.skype.com",
  },
  zoom: {
    displayName: "Zoom", category: "messaging",
    aliases: ["zoom"],
    scheme: "zoomus://",
    fallback: "zoomus://",
    webUrl: "https://zoom.us",
  },
  facetime: {
    displayName: "FaceTime", category: "messaging",
    aliases: ["facetime", "face time"],
    scheme: "facetime://",
    fallback: "facetime://",
    webUrl: "https://facetime.apple.com",
  },

  // ── Social Media ──────────────────────────────────────────────────────────
  instagram: {
    displayName: "Instagram", category: "social",
    aliases: ["instagram", "ig", "insta"],
    scheme: "instagram://",
    schemeAndroid: "intent://instagram.com#Intent;package=com.instagram.android;scheme=https;end",
    fallback: "instagram://",
    webUrl: "https://instagram.com",
  },
  threads: {
    displayName: "Threads", category: "social",
    aliases: ["threads", "instagram threads"],
    scheme: "barcelona://",
    schemeAndroid: "intent://barcelona.instagram.com#Intent;package=com.instagram.barcelona;scheme=https;end",
    fallback: "https://threads.net",
    webUrl: "https://threads.net",
  },
  tiktok: {
    displayName: "TikTok", category: "social",
    aliases: ["tiktok", "tik tok"],
    scheme: "tiktok://",
    schemeAndroid: "intent://tiktok.com#Intent;package=com.zhiliaoapp.musically;scheme=https;end",
    fallback: "https://tiktok.com",
    webUrl: "https://tiktok.com",
  },
  facebook: {
    displayName: "Facebook", category: "social",
    aliases: ["facebook", "fb"],
    scheme: "fb://",
    schemeAndroid: "intent://facebook.com#Intent;package=com.facebook.katana;scheme=https;end",
    fallback: "fb://",
    webUrl: "https://facebook.com",
  },
  twitter: {
    displayName: "X / Twitter", category: "social",
    aliases: ["twitter", "x twitter", "tweet", "x app", "x social"],
    scheme: "twitter://post?message=[TEXT]",
    fallback: "https://twitter.com/intent/tweet?text=[TEXT]",
    webUrl: "https://twitter.com/intent/tweet?text=[TEXT]",
    supportsText: true,
  },
  snapchat: {
    displayName: "Snapchat", category: "social",
    aliases: ["snapchat", "snap"],
    scheme: "snapchat://",
    schemeAndroid: "intent://snapchat.com#Intent;package=com.snapchat.android;scheme=https;end",
    fallback: "snapchat://",
    webUrl: "https://snapchat.com",
  },
  linkedin: {
    displayName: "LinkedIn", category: "social",
    aliases: ["linkedin", "linked in"],
    scheme: "linkedin://",
    schemeAndroid: "intent://linkedin.com#Intent;package=com.linkedin.android;scheme=https;end",
    fallback: "linkedin://",
    webUrl: "https://linkedin.com",
  },
  pinterest: {
    displayName: "Pinterest", category: "social",
    aliases: ["pinterest"],
    scheme: "pinterest://",
    fallback: "pinterest://",
    webUrl: "https://pinterest.com/search/pins/?q=[QUERY]",
    supportsSearch: true,
  },
  reddit: {
    displayName: "Reddit", category: "social",
    aliases: ["reddit"],
    scheme: "reddit://r/[SUBREDDIT]",
    fallback: "reddit://",
    webUrl: "https://reddit.com/search/?q=[QUERY]",
    supportsSearch: true,
  },
  tumblr: {
    displayName: "Tumblr", category: "social",
    aliases: ["tumblr"],
    scheme: "tumblr://",
    fallback: "tumblr://",
    webUrl: "https://tumblr.com",
    supportsText: true,
  },
  quora: {
    displayName: "Quora", category: "social",
    aliases: ["quora"],
    scheme: "quora://",
    fallback: "quora://",
    webUrl: "https://quora.com/search?q=[QUERY]",
    supportsSearch: true,
  },
  bereal: {
    displayName: "BeReal", category: "social",
    aliases: ["bereal", "be real"],
    scheme: "bereal://",
    fallback: "https://bere.al",
    webUrl: "https://bere.al",
  },

  // ── Entertainment ─────────────────────────────────────────────────────────
  youtube: {
    displayName: "YouTube", category: "entertainment",
    aliases: ["youtube", "yt"],
    scheme: "youtube://results?search_query=[QUERY]",
    schemeAndroid: "intent://www.youtube.com/results?search_query=[QUERY]#Intent;package=com.google.android.youtube;scheme=https;end",
    fallback: "youtube://",
    webUrl: "https://youtube.com/results?search_query=[QUERY]",
    supportsSearch: true,
  },
  youtubemusic: {
    displayName: "YouTube Music", category: "entertainment",
    aliases: ["youtube music", "yt music"],
    scheme: "youtubemusic://",
    schemeAndroid: "intent://music.youtube.com/search?q=[QUERY]#Intent;package=com.google.android.apps.youtube.music;scheme=https;end",
    fallback: "https://music.youtube.com/search?q=[QUERY]",
    webUrl: "https://music.youtube.com/search?q=[QUERY]",
    supportsSearch: true,
  },
  spotify: {
    displayName: "Spotify", category: "entertainment",
    aliases: ["spotify"],
    scheme: "spotify://search/[QUERY]",
    fallback: "spotify://",
    webUrl: "https://open.spotify.com/search/[QUERY]",
    supportsSearch: true,
  },
  netflix: {
    displayName: "Netflix", category: "entertainment",
    aliases: ["netflix"],
    scheme: "nflx://",
    schemeAndroid: "intent://netflix.com#Intent;package=com.netflix.mediaclient;scheme=https;end",
    fallback: "nflx://",
    webUrl: "https://netflix.com",
    supportsSearch: true,
  },
  disneyplus: {
    displayName: "Disney+", category: "entertainment",
    aliases: ["disney plus", "disney+", "disneyplus"],
    scheme: "disneyplus://",
    schemeAndroid: "intent://disneyplus.com#Intent;package=com.disney.disneyplus;scheme=https;end",
    fallback: "https://disneyplus.com",
    webUrl: "https://disneyplus.com",
  },
  max: {
    displayName: "Max (HBO)", category: "entertainment",
    aliases: ["hbo max", "max streaming", "hbo"],
    scheme: "max://",
    schemeAndroid: "intent://play.max.com#Intent;package=com.hbo.hbonow;scheme=https;end",
    fallback: "https://play.max.com",
    webUrl: "https://play.max.com",
  },
  hulu: {
    displayName: "Hulu", category: "entertainment",
    aliases: ["hulu"],
    scheme: "hulu://",
    schemeAndroid: "intent://hulu.com#Intent;package=com.hulu.plus;scheme=https;end",
    fallback: "https://hulu.com",
    webUrl: "https://hulu.com",
  },
  primevideo: {
    displayName: "Amazon Prime Video", category: "entertainment",
    aliases: ["prime video", "amazon prime video", "amazon prime"],
    scheme: "aiv://",
    schemeAndroid: "intent://www.amazon.com/gp/video/storefront#Intent;package=com.amazon.avod.thirdpartyclient;scheme=https;end",
    fallback: "https://primevideo.com",
    webUrl: "https://primevideo.com",
  },
  twitch: {
    displayName: "Twitch", category: "entertainment",
    aliases: ["twitch"],
    scheme: "twitch://stream/[USER]",
    fallback: "twitch://",
    webUrl: "https://twitch.tv",
    supportsSearch: true,
  },
  soundcloud: {
    displayName: "SoundCloud", category: "entertainment",
    aliases: ["soundcloud", "sound cloud"],
    scheme: "soundcloud://search?q=[QUERY]",
    fallback: "soundcloud://",
    webUrl: "https://soundcloud.com/search?q=[QUERY]",
    supportsSearch: true,
  },
  applemusic: {
    displayName: "Apple Music", category: "entertainment",
    aliases: ["apple music"],
    scheme: "music://search?term=[QUERY]",
    fallback: "music://",
    webUrl: "https://music.apple.com/search?term=[QUERY]",
    supportsSearch: true,
  },
  tidal: {
    displayName: "Tidal", category: "entertainment",
    aliases: ["tidal"],
    scheme: "tidal://search?query=[QUERY]",
    fallback: "https://listen.tidal.com/search?q=[QUERY]",
    webUrl: "https://listen.tidal.com/search?q=[QUERY]",
    supportsSearch: true,
  },
  deezer: {
    displayName: "Deezer", category: "entertainment",
    aliases: ["deezer"],
    scheme: "deezer://search/[QUERY]",
    fallback: "https://deezer.com/search/[QUERY]",
    webUrl: "https://deezer.com/search/[QUERY]",
    supportsSearch: true,
  },
  audible: {
    displayName: "Audible", category: "entertainment",
    aliases: ["audible"],
    scheme: "audible://",
    schemeAndroid: "intent://audible.com#Intent;package=com.audible.application;scheme=https;end",
    fallback: "https://audible.com",
    webUrl: "https://audible.com",
  },
  shazam: {
    displayName: "Shazam", category: "entertainment",
    aliases: ["shazam"],
    scheme: "shazam://",
    fallback: "shazam://",
    webUrl: "https://shazam.com",
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  paypal: {
    displayName: "PayPal", category: "finance",
    aliases: ["paypal", "pay pal"],
    scheme: "paypal://",
    schemeAndroid: "intent://paypal.com#Intent;package=com.paypal.android.p2pmobile;scheme=https;end",
    fallback: "paypal://",
    webUrl: "https://paypal.com",
  },
  venmo: {
    displayName: "Venmo", category: "finance",
    aliases: ["venmo"],
    scheme: "venmo://",
    schemeAndroid: "intent://venmo.com#Intent;package=com.venmo;scheme=https;end",
    fallback: "venmo://",
    webUrl: "https://venmo.com",
  },
  cashapp: {
    displayName: "Cash App", category: "finance",
    aliases: ["cash app", "cashapp"],
    scheme: "cashme://",
    schemeAndroid: "intent://cash.app#Intent;package=com.squareup.cash;scheme=https;end",
    fallback: "cashme://",
    webUrl: "https://cash.app",
  },
  revolut: {
    displayName: "Revolut", category: "finance",
    aliases: ["revolut"],
    scheme: "revolut://",
    schemeAndroid: "intent://revolut.com#Intent;package=com.revolut.revolut;scheme=https;end",
    fallback: "https://revolut.com",
    webUrl: "https://revolut.com",
  },
  wise: {
    displayName: "Wise", category: "finance",
    aliases: ["wise", "transferwise", "transfer wise"],
    scheme: "wise://",
    schemeAndroid: "intent://wise.com#Intent;package=com.transferwise.android;scheme=https;end",
    fallback: "https://wise.com",
    webUrl: "https://wise.com",
  },
  robinhood: {
    displayName: "Robinhood", category: "finance",
    aliases: ["robinhood"],
    scheme: "robinhood://",
    schemeAndroid: "intent://robinhood.com#Intent;package=com.robinhood.android;scheme=https;end",
    fallback: "https://robinhood.com",
    webUrl: "https://robinhood.com",
  },
  coinbase: {
    displayName: "Coinbase", category: "finance",
    aliases: ["coinbase"],
    scheme: "coinbase://",
    schemeAndroid: "intent://coinbase.com#Intent;package=com.coinbase.android;scheme=https;end",
    fallback: "coinbase://",
    webUrl: "https://coinbase.com",
  },
  binance: {
    displayName: "Binance", category: "finance",
    aliases: ["binance"],
    scheme: "bnc://",
    schemeAndroid: "intent://binance.com#Intent;package=com.binance.dev;scheme=https;end",
    fallback: "bnc://",
    webUrl: "https://binance.com",
  },
  kraken: {
    displayName: "Kraken", category: "finance",
    aliases: ["kraken"],
    scheme: "kraken://",
    fallback: "https://kraken.com",
    webUrl: "https://kraken.com",
  },
  klarna: {
    displayName: "Klarna", category: "finance",
    aliases: ["klarna"],
    scheme: "klarna://",
    schemeAndroid: "intent://klarna.com#Intent;package=com.myklarna.android;scheme=https;end",
    fallback: "https://klarna.com",
    webUrl: "https://klarna.com",
  },
  metamask: {
    displayName: "MetaMask", category: "finance",
    aliases: ["metamask", "meta mask"],
    scheme: "metamask://",
    schemeAndroid: "intent://metamask.io#Intent;package=io.metamask;scheme=https;end",
    fallback: "https://metamask.io",
    webUrl: "https://metamask.io",
  },

  // ── Travel & Maps ─────────────────────────────────────────────────────────
  googlemaps: {
    displayName: "Google Maps", category: "travel",
    aliases: ["google maps", "gmaps"],
    scheme: "comgooglemaps://?q=[QUERY]",
    schemeAndroid: "intent://maps.google.com/maps?q=[QUERY]#Intent;package=com.google.android.apps.maps;scheme=https;end",
    fallback: "comgooglemaps://",
    webUrl: "https://maps.google.com/maps?q=[QUERY]",
    supportsSearch: true,
  },
  applemaps: {
    displayName: "Apple Maps", category: "travel",
    aliases: ["apple maps"],
    scheme: "maps://?q=[QUERY]",
    fallback: "maps://",
    webUrl: "https://maps.apple.com/?q=[QUERY]",
    supportsSearch: true,
  },
  waze: {
    displayName: "Waze", category: "travel",
    aliases: ["waze"],
    scheme: "waze://?q=[QUERY]",
    schemeAndroid: "intent://waze.com#Intent;package=com.waze;scheme=https;end",
    fallback: "waze://",
    webUrl: "https://waze.com",
    supportsSearch: true,
  },
  uber: {
    displayName: "Uber", category: "travel",
    aliases: ["uber"],
    scheme: "uber://",
    schemeAndroid: "intent://uber.com#Intent;package=com.ubercab;scheme=https;end",
    fallback: "uber://",
    webUrl: "https://m.uber.com",
  },
  lyft: {
    displayName: "Lyft", category: "travel",
    aliases: ["lyft"],
    scheme: "lyft://",
    schemeAndroid: "intent://lyft.com#Intent;package=me.lyft.android;scheme=https;end",
    fallback: "lyft://",
    webUrl: "https://lyft.com",
  },
  bolt: {
    displayName: "Bolt", category: "travel",
    aliases: ["bolt", "bolt taxi", "taxify"],
    scheme: "bolt://",
    schemeAndroid: "intent://bolt.eu#Intent;package=ee.mtakso.client;scheme=https;end",
    fallback: "https://bolt.eu",
    webUrl: "https://bolt.eu",
  },
  airbnb: {
    displayName: "Airbnb", category: "travel",
    aliases: ["airbnb", "air bnb"],
    scheme: "airbnb://",
    schemeAndroid: "intent://airbnb.com#Intent;package=com.airbnb.android;scheme=https;end",
    fallback: "airbnb://",
    webUrl: "https://airbnb.com",
  },
  booking: {
    displayName: "Booking.com", category: "travel",
    aliases: ["booking.com", "booking", "booking com"],
    scheme: "booking://",
    schemeAndroid: "intent://booking.com#Intent;package=com.booking;scheme=https;end",
    fallback: "https://booking.com",
    webUrl: "https://booking.com",
    supportsSearch: true,
  },
  tripadvisor: {
    displayName: "Tripadvisor", category: "travel",
    aliases: ["tripadvisor", "trip advisor"],
    scheme: "tripadvisor://",
    schemeAndroid: "intent://tripadvisor.com#Intent;package=com.tripadvisor.tripadvisor;scheme=https;end",
    fallback: "https://tripadvisor.com",
    webUrl: "https://tripadvisor.com/Search?q=[QUERY]",
    supportsSearch: true,
  },
  expedia: {
    displayName: "Expedia", category: "travel",
    aliases: ["expedia"],
    scheme: "expedia://",
    schemeAndroid: "intent://expedia.com#Intent;package=com.expedia.bookings;scheme=https;end",
    fallback: "https://expedia.com",
    webUrl: "https://expedia.com",
  },

  // ── Food Delivery ─────────────────────────────────────────────────────────
  ubereats: {
    displayName: "Uber Eats", category: "food",
    aliases: ["uber eats", "ubereats"],
    scheme: "ubereats://",
    schemeAndroid: "intent://ubereats.com#Intent;package=com.ubercab.eats;scheme=https;end",
    fallback: "ubereats://",
    webUrl: "https://ubereats.com",
  },
  doordash: {
    displayName: "DoorDash", category: "food",
    aliases: ["doordash", "door dash"],
    scheme: "doordash://",
    schemeAndroid: "intent://doordash.com#Intent;package=com.dd.doordash;scheme=https;end",
    fallback: "doordash://",
    webUrl: "https://doordash.com",
  },
  grubhub: {
    displayName: "Grubhub", category: "food",
    aliases: ["grubhub", "grub hub"],
    scheme: "grubhub://",
    schemeAndroid: "intent://grubhub.com#Intent;package=com.grubhub.android;scheme=https;end",
    fallback: "https://grubhub.com",
    webUrl: "https://grubhub.com",
  },
  deliveroo: {
    displayName: "Deliveroo", category: "food",
    aliases: ["deliveroo"],
    scheme: "deliveroo://",
    schemeAndroid: "intent://deliveroo.com#Intent;package=com.deliveroo.orderapp;scheme=https;end",
    fallback: "https://deliveroo.com",
    webUrl: "https://deliveroo.com",
  },

  // ── Shopping ──────────────────────────────────────────────────────────────
  amazon: {
    displayName: "Amazon", category: "shopping",
    aliases: ["amazon"],
    scheme: "amazon://search?field-keywords=[QUERY]",
    schemeAndroid: "intent://www.amazon.com/s?k=[QUERY]#Intent;package=com.amazon.mShop.android.shopping;scheme=https;end",
    fallback: "https://amazon.com/s?k=[QUERY]",
    webUrl: "https://amazon.com/s?k=[QUERY]",
    supportsSearch: true,
  },
  ebay: {
    displayName: "eBay", category: "shopping",
    aliases: ["ebay", "e bay"],
    scheme: "ebay://",
    schemeAndroid: "intent://ebay.com/sch/i.html?_nkw=[QUERY]#Intent;package=com.ebay.mobile;scheme=https;end",
    fallback: "https://ebay.com/sch/i.html?_nkw=[QUERY]",
    webUrl: "https://ebay.com/sch/i.html?_nkw=[QUERY]",
    supportsSearch: true,
  },
  etsy: {
    displayName: "Etsy", category: "shopping",
    aliases: ["etsy"],
    scheme: "etsy://",
    schemeAndroid: "intent://etsy.com/search?q=[QUERY]#Intent;package=com.etsy.android;scheme=https;end",
    fallback: "https://etsy.com/search?q=[QUERY]",
    webUrl: "https://etsy.com/search?q=[QUERY]",
    supportsSearch: true,
  },
  shein: {
    displayName: "SHEIN", category: "shopping",
    aliases: ["shein", "she in"],
    scheme: "shein://",
    schemeAndroid: "intent://shein.com#Intent;package=com.zzkko;scheme=https;end",
    fallback: "https://shein.com",
    webUrl: "https://shein.com",
  },

  // ── Productivity ──────────────────────────────────────────────────────────
  notion: {
    displayName: "Notion", category: "productivity",
    aliases: ["notion"],
    scheme: "notion://",
    schemeAndroid: "intent://notion.so#Intent;package=notion.id;scheme=https;end",
    fallback: "notion://",
    webUrl: "https://notion.so",
  },
  todoist: {
    displayName: "Todoist", category: "productivity",
    aliases: ["todoist"],
    scheme: "todoist://x-callback-url/additem?content=[TEXT]",
    schemeAndroid: "intent://todoist.com#Intent;package=com.todoist;scheme=https;end",
    fallback: "todoist://",
    webUrl: "https://todoist.com",
    supportsText: true,
  },
  trello: {
    displayName: "Trello", category: "productivity",
    aliases: ["trello"],
    scheme: "trello://",
    schemeAndroid: "intent://trello.com#Intent;package=com.trello;scheme=https;end",
    fallback: "trello://",
    webUrl: "https://trello.com",
  },
  dropbox: {
    displayName: "Dropbox", category: "productivity",
    aliases: ["dropbox"],
    scheme: "dbapi-3://",
    schemeAndroid: "intent://dropbox.com#Intent;package=com.dropbox.android;scheme=https;end",
    fallback: "https://dropbox.com",
    webUrl: "https://dropbox.com",
  },
  googledrive: {
    displayName: "Google Drive", category: "productivity",
    aliases: ["google drive", "gdrive", "drive"],
    scheme: "googledrive://",
    schemeAndroid: "intent://drive.google.com#Intent;package=com.google.android.apps.docs;scheme=https;end",
    fallback: "https://drive.google.com",
    webUrl: "https://drive.google.com",
  },
  googlecalendar: {
    displayName: "Google Calendar", category: "productivity",
    aliases: ["google calendar", "gcalendar", "calendar"],
    scheme: "googlecalendar://",
    schemeAndroid: "intent://calendar.google.com#Intent;package=com.google.android.calendar;scheme=https;end",
    fallback: "https://calendar.google.com",
    webUrl: "https://calendar.google.com",
  },
  evernote: {
    displayName: "Evernote", category: "productivity",
    aliases: ["evernote", "ever note"],
    scheme: "evernote://",
    schemeAndroid: "intent://evernote.com#Intent;package=com.evernote;scheme=https;end",
    fallback: "evernote://",
    webUrl: "https://evernote.com",
  },
  onenote: {
    displayName: "OneNote", category: "productivity",
    aliases: ["onenote", "one note", "microsoft onenote"],
    scheme: "ms-onenote://",
    schemeAndroid: "intent://onenote.com#Intent;package=com.microsoft.office.onenote;scheme=https;end",
    fallback: "ms-onenote://",
    webUrl: "https://onenote.com",
  },
  asana: {
    displayName: "Asana", category: "productivity",
    aliases: ["asana"],
    scheme: "asana://",
    schemeAndroid: "intent://asana.com#Intent;package=com.asana.app;scheme=https;end",
    fallback: "https://asana.com",
    webUrl: "https://asana.com",
  },
  canva: {
    displayName: "Canva", category: "productivity",
    aliases: ["canva"],
    scheme: "canva://",
    schemeAndroid: "intent://canva.com#Intent;package=com.canva.editor;scheme=https;end",
    fallback: "canva://",
    webUrl: "https://canva.com",
  },

  // ── Health & Fitness ──────────────────────────────────────────────────────
  strava: {
    displayName: "Strava", category: "health",
    aliases: ["strava"],
    scheme: "strava://",
    schemeAndroid: "intent://strava.com#Intent;package=com.strava;scheme=https;end",
    fallback: "https://strava.com",
    webUrl: "https://strava.com",
  },
  myfitnesspal: {
    displayName: "MyFitnessPal", category: "health",
    aliases: ["myfitnesspal", "my fitness pal", "mfp"],
    scheme: "myfitnesspal://",
    schemeAndroid: "intent://myfitnesspal.com#Intent;package=com.myfitnesspal.android;scheme=https;end",
    fallback: "https://myfitnesspal.com",
    webUrl: "https://myfitnesspal.com",
  },
  headspace: {
    displayName: "Headspace", category: "health",
    aliases: ["headspace", "head space"],
    scheme: "headspace://",
    schemeAndroid: "intent://headspace.com#Intent;package=com.getsomeheadspace.android;scheme=https;end",
    fallback: "https://headspace.com",
    webUrl: "https://headspace.com",
  },
  calm: {
    displayName: "Calm", category: "health",
    aliases: ["calm"],
    scheme: "calm://",
    schemeAndroid: "intent://calm.com#Intent;package=com.calm.android;scheme=https;end",
    fallback: "https://calm.com",
    webUrl: "https://calm.com",
  },
  duolingo: {
    displayName: "Duolingo", category: "health",
    aliases: ["duolingo"],
    scheme: "duolingo://",
    schemeAndroid: "intent://duolingo.com#Intent;package=com.duolingo;scheme=https;end",
    fallback: "https://duolingo.com",
    webUrl: "https://duolingo.com",
  },
  nikerun: {
    displayName: "Nike Run Club", category: "health",
    aliases: ["nike run club", "nike run", "nrc"],
    scheme: "nikerunclub://",
    schemeAndroid: "intent://nikerunclub.com#Intent;package=com.nike.plusgps;scheme=https;end",
    fallback: "https://nike.com/running",
    webUrl: "https://nike.com/running",
  },

  // ── AI & Tools ────────────────────────────────────────────────────────────
  chatgpt: {
    displayName: "ChatGPT", category: "ai",
    aliases: ["chatgpt", "chat gpt", "openai"],
    scheme: "chatgpt://",
    schemeAndroid: "intent://chatgpt.com#Intent;package=com.openai.chatgpt;scheme=https;end",
    fallback: "chatgpt://",
    webUrl: "https://chatgpt.com",
  },
  googlesearch: {
    displayName: "Google", category: "ai",
    aliases: ["google", "google search"],
    scheme: "googlechrome://google.com/search?q=[QUERY]",
    schemeAndroid: "intent://www.google.com/search?q=[QUERY]#Intent;package=com.google.android.googlequicksearchbox;scheme=https;end",
    fallback: "https://google.com/search?q=[QUERY]",
    webUrl: "https://google.com/search?q=[QUERY]",
    supportsSearch: true,
  },
};

// ─── Detection & resolution helpers ──────────────────────────────────────────

function detectApp(lower: string): string | null {
  const verbPatterns = [
    /(?:open|launch|start|use|go\s+to|navigate\s+to|take\s+me\s+to)\s+(.+?)(?:\s+(?:and|to|app|for)\b|$)/i,
  ];

  for (const pattern of verbPatterns) {
    const m = lower.match(pattern);
    if (m) {
      const candidate = m[1]?.trim() ?? "";
      for (const [key, def] of Object.entries(APP_REGISTRY)) {
        for (const alias of def.aliases) {
          if (candidate.includes(alias)) return key;
        }
      }
    }
  }

  for (const [key, def] of Object.entries(APP_REGISTRY)) {
    for (const alias of def.aliases) {
      const re = new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$|,|\\.)`, "i");
      if (re.test(lower)) return key;
    }
  }

  return null;
}

function extractQuery(text: string): string {
  const m = text.match(
    /(?:search\s+for|search|find|play|listen\s+to|watch|look\s+up|navigate\s+to|directions?\s+to)\s+(.+?)(?:\s+on\s+\w+)?$/i
  );
  if (m) return m[1]?.trim() ?? "";
  return "";
}

function fillTemplate(template: string, text: string, subject = ""): string {
  const encoded = encodeURIComponent(text);
  const encodedSubject = encodeURIComponent(subject);
  return template
    .replace(/\[TEXT\]/g, encoded)
    .replace(/\[QUERY\]/g, encoded)
    .replace(/\[SUBJECT\]/g, encodedSubject)
    .replace(/\[SUBREDDIT\]/g, encoded)
    .replace(/\[USER\]/g, encoded);
}

/** Returns true when user wants to compose/prepare content for an app (not just open it) */
export function isComposeIntent(text: string): boolean {
  const composeVerbs = /\b(prepare|write|compose|draft|create|send|type|message|text|tweet|post|email)\b/i;
  const appMentions = new RegExp(
    Object.values(APP_REGISTRY)
      .flatMap((d) => d.aliases)
      .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "i"
  );

  if (composeVerbs.test(text) && appMentions.test(text)) return true;
  if (/\b(send|write|prepare|draft)\s+a?\s*(whatsapp|telegram|sms|text|message|tweet|email|mail)\b/i.test(text)) return true;

  return false;
}

/** Parse a DEEPLINK JSON blob that the AI embedded in its response */
export function parseDeepLinkFromAIResponse(responseText: string): DeepLinkResult | null {
  const match = responseText.match(/DEEPLINK:(\{[\s\S]*?\})\s*$/m);
  if (!match) return null;
  try {
    const raw = JSON.parse(match[1]) as Partial<DeepLinkResult>;
    if (!raw.app || !raw.displayName) return null;

    const def = APP_REGISTRY[raw.app];
    if (!def) return null;

    const prefillText = raw.prefillText ?? "";
    let scheme = raw.scheme ?? def.scheme;
    let fallback = raw.fallback ?? def.fallback;
    let webUrl = raw.webUrl ?? def.webUrl;

    if (prefillText) {
      scheme = fillTemplate(def.scheme, prefillText);
      fallback = fillTemplate(def.fallback, prefillText);
      webUrl = fillTemplate(def.webUrl, prefillText);
      if (/\[[A-Z_]+\]/.test(scheme)) scheme = def.fallback.replace(/\[[A-Z_]+\]/g, "");
      if (/\[[A-Z_]+\]/.test(webUrl)) webUrl = def.webUrl.split("?")[0] ?? def.webUrl;
    }

    return {
      app: raw.app,
      scheme,
      fallback: fallback.replace(/\[[A-Z_]+\]/g, ""),
      webUrl: webUrl.replace(/\[[A-Z_]+\]/g, ""),
      displayName: def.displayName,
      prefillText: prefillText || undefined,
      action: raw.action ?? (prefillText ? "message" : "open"),
    };
  } catch {
    return null;
  }
}

export function parseDeepLinkIntent(text: string): DeepLinkResult | null {
  if (isComposeIntent(text)) return null;

  const lower = text.toLowerCase();
  const appKey = detectApp(lower);
  if (!appKey) return null;

  const def = APP_REGISTRY[appKey];
  if (!def) return null;

  const query = extractQuery(text);

  let scheme = query ? fillTemplate(def.scheme, query) : def.scheme;
  let webUrl = query ? fillTemplate(def.webUrl, query) : def.webUrl;

  if (/\[[A-Z_]+\]/.test(scheme)) scheme = def.fallback.replace(/\[[A-Z_]+\]/g, "");
  if (/\[[A-Z_]+\]/.test(webUrl)) webUrl = (def.webUrl.split("?")[0] ?? def.webUrl);

  return {
    app: appKey,
    scheme,
    fallback: def.fallback.replace(/\[[A-Z_]+\]/g, ""),
    webUrl,
    displayName: def.displayName,
    action: query && def.supportsSearch ? "search" : "open",
  };
}

export function formatDeepLinkContext(dl: DeepLinkResult): string {
  return `DEEPLINK:${JSON.stringify({
    app: dl.app,
    scheme: dl.scheme,
    fallback: dl.fallback,
    webUrl: dl.webUrl,
    displayName: dl.displayName,
    prefillText: dl.prefillText,
    action: dl.action,
  })}`;
}

export function getDeepLinkSystemInstruction(): string {
  const messaging = Object.entries(APP_REGISTRY)
    .filter(([, d]) => d.supportsText)
    .map(([, d]) => d.displayName)
    .join(", ");

  const searchApps = Object.entries(APP_REGISTRY)
    .filter(([, d]) => d.supportsSearch)
    .map(([, d]) => d.displayName)
    .join(", ");

  const allApps = Object.values(APP_REGISTRY).map((d) => d.displayName).join(", ");

  return `
## App Actions

You can open apps, search inside them, or compose/pre-fill content for the user. At the END of your response (last line), output DEEPLINK JSON if an app action is needed.

### 1. Opening an app
"Opening Spotify for you."
DEEPLINK:{"app":"spotify","scheme":"spotify://","fallback":"spotify://","webUrl":"https://open.spotify.com","displayName":"Spotify","action":"open"}

### 2. Searching inside an app (${searchApps})
"Here's how to search for that on YouTube."
DEEPLINK:{"app":"youtube","scheme":"youtube://results?search_query=Drake","fallback":"youtube://","webUrl":"https://youtube.com/results?search_query=Drake","displayName":"YouTube","action":"search"}

### 3. Composing / pre-filling a message (${messaging})
When the user asks to compose/prepare/write/draft content for a messaging or posting app, write the composed content naturally in your reply, then at the very end add DEEPLINK JSON with:
- "action": "message" or "compose"
- "prefillText": the EXACT message text to pre-fill (plain text, no markdown)
- Leave scheme/fallback/webUrl as empty strings — the system will build them from prefillText

Example — "prepare a WhatsApp message to check in with a friend":
"Here's a friendly check-in message you can send:

Hey! Just wanted to check in and see how you're doing. Hope everything's going well on your end! Let me know if you want to catch up soon 😊

DEEPLINK:{"app":"whatsapp","scheme":"","fallback":"","webUrl":"","displayName":"WhatsApp","prefillText":"Hey! Just wanted to check in and see how you're doing. Hope everything's going well on your end! Let me know if you want to catch up soon 😊","action":"message"}"

Example — "draft a tweet about the new iPhone":
"Here's a tweet you can post:

Just got hands on the new iPhone — the camera is absolutely stunning. The AI features alone make it worth the upgrade. 10/10 would recommend. #iPhone #Apple #Tech

DEEPLINK:{"app":"twitter","scheme":"","fallback":"","webUrl":"","displayName":"X / Twitter","prefillText":"Just got hands on the new iPhone — the camera is absolutely stunning. The AI features alone make it worth the upgrade. 10/10 would recommend. #iPhone #Apple #Tech","action":"compose"}"

Supported apps: ${allApps}

IMPORTANT: Only output DEEPLINK if the user clearly wants to take an action in an app. Never output DEEPLINK for general questions. The DEEPLINK line must be the very last line of your response.`.trim();
}

/** Returns the Android-specific scheme for an app (falls back to iOS scheme if none defined) */
export function getAndroidScheme(app: string, query = ""): string {
  const def = APP_REGISTRY[app];
  if (!def) return "";
  const template = def.schemeAndroid ?? def.scheme;
  return query ? fillTemplate(template, query) : template.replace(/\[[A-Z_]+\]/g, "");
}

/** Returns all apps grouped by category */
export function getAppsByCategory(): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const def of Object.values(APP_REGISTRY)) {
    if (!grouped[def.category]) grouped[def.category] = [];
    grouped[def.category]!.push(def.displayName);
  }
  return grouped;
}

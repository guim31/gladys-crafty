// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the players text, the "Test the connection"
// report, scene action errors. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './crafty/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  missing: {
    en: 'Enter the address of Crafty and an API token in the configuration.',
    fr: "Saisissez l'adresse de Crafty et un jeton d'API dans la configuration.",
    de: 'Gib die Adresse von Crafty und ein API-Token in der Konfiguration ein.',
    es: 'Introduzca la dirección de Crafty y un token de API en la configuración.',
  },
  badUrl: {
    en: 'Address not understood, e.g. https://192.168.1.10:8443',
    fr: 'Adresse incomprise, ex. https://192.168.1.10:8443',
    de: 'Adresse nicht verstanden, z. B. https://192.168.1.10:8443',
    es: 'Dirección no válida, p. ej. https://192.168.1.10:8443',
  },
  noServer: {
    en: 'Crafty answers, but this token sees no server.',
    fr: 'Crafty répond, mais ce jeton ne voit aucun serveur.',
    de: 'Crafty antwortet, aber dieses Token sieht keinen Server.',
    es: 'Crafty responde, pero este token no ve ningún servidor.',
  },
};

// One short explanation per error kind (src/crafty/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Crafty unreachable (address, port, Crafty running?)',
    fr: 'Crafty injoignable (adresse, port, Crafty lancé ?)',
    de: 'Crafty nicht erreichbar (Adresse, Port, läuft Crafty?)',
    es: 'Crafty inaccesible (¿dirección, puerto, Crafty en marcha?)',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'Crafty does not answer in time',
    fr: 'Crafty ne répond pas à temps',
    de: 'Crafty antwortet nicht rechtzeitig',
    es: 'Crafty no responde a tiempo',
  },
  [ERROR_KINDS.TLS]: {
    en: 'Certificate refused: tick "Accept self-signed certificates"',
    fr: 'Certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'Certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused by Crafty',
    fr: "Jeton d'API refusé par Crafty",
    de: 'API-Token von Crafty abgelehnt',
    es: 'Token de API rechazado por Crafty',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'Permission missing for this token in Crafty',
    fr: 'Droit manquant pour ce jeton dans Crafty',
    de: 'Fehlende Berechtigung für dieses Token in Crafty',
    es: 'Falta un permiso para este token en Crafty',
  },
  [ERROR_KINDS.NOT_CRAFTY]: {
    en: 'This address is not the Crafty API (http or https?)',
    fr: "Cette adresse n'est pas l'API de Crafty (http ou https ?)",
    de: 'Diese Adresse ist nicht die Crafty-API (http oder https?)',
    es: 'Esta dirección no es la API de Crafty (¿http o https?)',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'Crafty redirects: use its https:// address',
    fr: 'Crafty redirige : utilisez son adresse en https://',
    de: 'Crafty leitet um: Nutze seine https://-Adresse',
    es: 'Crafty redirige: use su dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Crafty refused the request',
    fr: 'Crafty a refusé la requête',
    de: 'Crafty hat die Anfrage abgelehnt',
    es: 'Crafty ha rechazado la solicitud',
  },
};

// The "Players" feature and the "Status" words (src/devices.js, src/widgets.js).
export const PLAYERS_TEXT = {
  en: {
    nobody: 'Nobody',
    stopped: 'Server stopped',
    starting: 'Server starting',
    count: (count) => `${count} player(s)`,
    more: (count) => `and ${count} more`,
  },
  fr: {
    nobody: 'Personne',
    stopped: 'Serveur arrêté',
    starting: 'Serveur en démarrage',
    count: (count) => `${count} joueur(s)`,
    more: (count) => `et ${count} autre(s)`,
  },
  de: {
    nobody: 'Niemand',
    stopped: 'Server gestoppt',
    starting: 'Server startet',
    count: (count) => `${count} Spieler`,
    more: (count) => `und ${count} weitere`,
  },
  es: {
    nobody: 'Nadie',
    stopped: 'Servidor detenido',
    starting: 'Servidor arrancando',
    count: (count) => `${count} jugador(es)`,
    more: (count) => `y ${count} más`,
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    running: 'running',
    stopped: 'stopped',
    players: (online, max) => `${online}/${max} players`,
    servers: (count) => `Crafty answers: ${count} server(s).`,
    stopAllowed: 'Stop and restart allowed.',
    stopDenied: 'Stop and restart not allowed (see the configuration).',
  },
  fr: {
    running: 'en marche',
    stopped: 'arrêté',
    players: (online, max) => `${online}/${max} joueurs`,
    servers: (count) => `Crafty répond : ${count} serveur(s).`,
    stopAllowed: 'Arrêt et redémarrage autorisés.',
    stopDenied: 'Arrêt et redémarrage non autorisés (voir la configuration).',
  },
  de: {
    running: 'läuft',
    stopped: 'gestoppt',
    players: (online, max) => `${online}/${max} Spieler`,
    servers: (count) => `Crafty antwortet: ${count} Server.`,
    stopAllowed: 'Stoppen und Neustarten erlaubt.',
    stopDenied: 'Stoppen und Neustarten nicht erlaubt (siehe Konfiguration).',
  },
  es: {
    running: 'en marcha',
    stopped: 'detenido',
    players: (online, max) => `${online}/${max} jugadores`,
    servers: (count) => `Crafty responde: ${count} servidor(es).`,
    stopAllowed: 'Detener y reiniciar permitido.',
    stopDenied: 'Detener y reiniciar no permitido (vea la configuración).',
  },
};

// Errors and results of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noCrafty: {
    en: 'Crafty is not configured.',
    fr: "Crafty n'est pas configuré.",
    de: 'Crafty ist nicht konfiguriert.',
    es: 'Crafty no está configurado.',
  },
  unknownServer: {
    en: 'This server is no longer in Crafty.',
    fr: "Ce serveur n'est plus dans Crafty.",
    de: 'Dieser Server ist nicht mehr in Crafty.',
    es: 'Este servidor ya no está en Crafty.',
  },
  stopDenied: {
    en: 'Stopping and restarting are off: allow them in the configuration of the integration.',
    fr: "L'arrêt et le redémarrage sont désactivés : autorisez-les dans la configuration de l'intégration.",
    de: 'Stoppen und Neustarten sind aus: Erlaube sie in der Konfiguration der Integration.',
    es: 'Detener y reiniciar están desactivados: permítalos en la configuración de la integración.',
  },
  noBackup: {
    en: 'This server has no backup configuration in Crafty.',
    fr: "Ce serveur n'a aucune configuration de sauvegarde dans Crafty.",
    de: 'Dieser Server hat keine Backup-Konfiguration in Crafty.',
    es: 'Este servidor no tiene ninguna configuración de copia de seguridad en Crafty.',
  },
  start_server: {
    en: 'Start requested.',
    fr: 'Démarrage demandé.',
    de: 'Start angefordert.',
    es: 'Arranque solicitado.',
  },
  stop_server: {
    en: 'Stop requested.',
    fr: 'Arrêt demandé.',
    de: 'Stopp angefordert.',
    es: 'Parada solicitada.',
  },
  restart_server: {
    en: 'Restart requested.',
    fr: 'Redémarrage demandé.',
    de: 'Neustart angefordert.',
    es: 'Reinicio solicitado.',
  },
  backup_server: {
    en: 'Backup started.',
    fr: 'Sauvegarde lancée.',
    de: 'Backup gestartet.',
    es: 'Copia de seguridad iniciada.',
  },
  alreadyRunning: {
    en: 'The server is already running.',
    fr: 'Le serveur est déjà en marche.',
    de: 'Der Server läuft bereits.',
    es: 'El servidor ya está en marcha.',
  },
  alreadyStopped: {
    en: 'The server is already stopped.',
    fr: 'Le serveur est déjà arrêté.',
    de: 'Der Server ist bereits gestoppt.',
    es: 'El servidor ya está detenido.',
  },
  refreshed: {
    en: 'Crafty read again.',
    fr: 'Crafty relu.',
    de: 'Crafty neu gelesen.',
    es: 'Crafty leído de nuevo.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

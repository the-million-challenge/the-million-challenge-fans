// firebase-config.js
// INSTRUCCIONES:
// 1) Crea un proyecto en Firebase (https://console.firebase.google.com).
// 2) Activa: Authentication (Email/Password), Firestore, Storage.
// 3) Copia tus credenciales de configuración y pégalas abajo en firebaseConfig.
// 4) NO publiques claves privadas ni service accounts en un repo público.
// 5) Para integración real con pagos y cobros, configura Stripe y Webhooks en un servidor o Cloud Functions.

const firebaseConfig = {
  apiKey: "REEMPLAZA_CON_TU_APIKEY",
  authDomain: "REEMPLAZA_CON_TU_AUTHDOMAIN",
  projectId: "REEMPLAZA_CON_TU_PROJECTID",
  storageBucket: "REEMPLAZA_CON_TU_STORAGEBUCKET",
  messagingSenderId: "REEMPLAZA_CON_TU_MESSAGINGSENDERID",
  appId: "REEMPLAZA_CON_TU_APPID"
};

// Stripe: Para un flujo simple usa Payment Links creados desde tu Dashboard de Stripe.
// Crea en Stripe Payment Links para diferentes cantidades (p. ej. 1,5,10 coronas) y pega aquí el map.
// En producción debes verificar pagos con webhooks seguros y anotar transacciones en Firestore desde el servidor.
const stripePaymentLinks = {
  // ejemplo: "1": "https://buy.stripe.com/test_XXXXXXXXXXXXXXXX",
  // "5": "https://buy.stripe.com/test_YYYYYYYYYYYYYYYY",
};

(function initFirebase(){
  if(!window.firebase) {
    console.error("Firebase SDK no cargado");
    return;
  }
  firebase.initializeApp(firebaseConfig);
  window.auth = firebase.auth();
  window.db = firebase.firestore();
  window.storage = firebase.storage();
})();
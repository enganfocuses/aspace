// Заполните адрес вашей базы Firebase Realtime Database (см. README.md)
window.CFG = {
  yonote: {workspace:'https://anesterovna.yonote.ru/home'},
  reserve: {enabled:true,url:'https://aspace-fallback-api.anncodes001.workers.dev'},
  // UID владельца будет добавлен после создания учётной записи в Firebase Authentication.
  ownerUid: 'cL7MbA9JSUQDEN794Fk7Uuj4WoO2',
  firebase: {
    apiKey: 'AIzaSyBLnl86ZjGYdIdY3ddMO6K2cTHzKSNIAVA',
    authDomain: 'myspace-5d573.firebaseapp.com',
    databaseURL: 'https://myspace-5d573-default-rtdb.firebaseio.com',
    projectId: 'myspace-5d573',
    storageBucket: 'myspace-5d573.firebasestorage.app',
    messagingSenderId: '958854089477',
    appId: '1:958854089477:web:48d8ab533c4144ab9f856c',
    measurementId: 'G-0KZLMCCZT6'
  },
  db: 'https://myspace-5d573-default-rtdb.firebaseio.com',
  // Для VPN и сетей с ограниченным UDP нужен TURN. Получите учётные данные у TURN-провайдера.
  // Желательно указать UDP/TCP и TLS на порту 443:
  // turn: [{urls: [
  //   'turn:turn.example.com:3478?transport=udp',
  //   'turn:turn.example.com:3478?transport=tcp',
  //   'turns:turn.example.com:443?transport=tcp'
  // ], username: 'TURN_USERNAME', credential: 'TURN_PASSWORD'}],
  turn: [],
  // Альтернатива: Metered Open Relay. Укажите app и key из своей учётной записи.
  metered: { app: '', key: '' }
};

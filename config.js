// Заполните адрес вашей базы Firebase Realtime Database (см. README.md)
window.CFG = {
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

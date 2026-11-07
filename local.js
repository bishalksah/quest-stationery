// Run on your own computer:  npm start
const app = require('./app');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Quest Stationery Store running at http://localhost:${PORT}`));

const app = require("./app");

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Server running in http://localhost:${port}`);
});

module.exports = app;

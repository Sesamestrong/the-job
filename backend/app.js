module.exports = new Promise(async (resolve, reject) => {
  const app = require("express")();
  app.use(require("cors")());
  const bodyParser = require("body-parser");

  const graphql = await require("./graphql.js");

  graphql(app);

  resolve(app);

});

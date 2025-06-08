const { MongoClient } = require("mongodb");
const client = new MongoClient(process.env.MONGO_URI);
module.exports = {
  connect: () => client.connect(),
  db: () => client.db('production')
};

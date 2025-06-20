const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const helmet = require("helmet");
const nocache = require("nocache");
const { messagesRouter } = require("./messages/messages.router");
const { errorHandler } = require("./middleware/error.middleware");
const { notFoundHandler } = require("./middleware/not-found.middleware");
const { auth0Router } = require("./auth0/auth0.router");
const { stravaRouter } = require("./strava/strava.router");
const { spotifyRouter } = require("./spotify/spotify.router");
const { appRouter } = require("./app/app.router");

dotenv.config();

const PORT = process.env.PORT || 4000;

const app = express();
const apiRouter = express.Router();

app.use(express.json());
app.set("json spaces", 2);

app.use(
  helmet({
    hsts: {
      maxAge: 31536000,
    },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
      },
    },
    frameguard: {
      action: "deny",
    },
  })
);

app.use((req, res, next) => {
  res.contentType("application/json; charset=utf-8");
  next();
});

app.use(nocache());

app.use(cors());

app.use("/api/v1", apiRouter);

apiRouter.use("/app", appRouter);
apiRouter.use("/messages", messagesRouter);
apiRouter.use("/auth0", auth0Router);
apiRouter.use("/strava", stravaRouter);
apiRouter.use("/spotify", spotifyRouter);

app.use(errorHandler);
app.use(notFoundHandler);

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

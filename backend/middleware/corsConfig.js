const cors = require("cors");

function createCorsMiddleware(allowedOrigins) {
  return cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
  });
}

module.exports = {
  createCorsMiddleware,
};
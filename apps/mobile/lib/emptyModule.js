// Stand-in for an optional dependency that is deliberately not installed. See metro.config.js:
// Metro resolves every import it finds, including ones guarded as optional by the importing
// package, so an absent optional dependency has to resolve to something.
module.exports = {};

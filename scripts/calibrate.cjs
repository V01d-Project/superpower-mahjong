// Frozen production algorithm, fresh independent seeds. Optional argument: high-luck n
// (default 5000, minimum 2000); negative n >= 5000, neutral n >= 20000.
process.argv.splice(2,0,'validate');
require('./calibration-run.cjs');

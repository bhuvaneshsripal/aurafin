// Vercel's Node runtime parses every request URL with the legacy url.parse(),
// which makes Node print "[DEP0169] DeprecationWarning: url.parse() behavior is
// not standardized..." as an *error-level* log line on each cold start. It is
// harmless and comes from the platform, not from Aurafin's code, but it buries
// real errors in the logs, so drop just that one warning. Import this file at
// the top of every api/ entry point. (Also safe to set NODE_OPTIONS=
// --disable-warning=DEP0169 in Vercel > Settings > Environment Variables.)
if (!process.emitWarning.__aurafinQuiet) {
  const original = process.emitWarning;
  const patched = function (warning, ...args) {
    const first = args[0];
    const code = typeof first === 'object' && first ? first.code : args[1];
    const text = typeof warning === 'string' ? warning : warning?.message ?? '';
    if (code === 'DEP0169' || text.includes('url.parse()')) return;
    return original.call(process, warning, ...args);
  };
  patched.__aurafinQuiet = true;
  process.emitWarning = patched;
}

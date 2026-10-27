// Keep gradient/clip ids stable-ish; 1 decimal on a ~1200-unit viewBox is < 0.03 px at 26 px.
export default { multipass: true, floatPrecision: 1, plugins: [{ name: 'preset-default' }] };

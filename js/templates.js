// Ready-made layouts for forms used often. Coordinates: PDF points from the top-left of each page.
// Box fields list only the area; the app finds the individual boxes on the uploaded PDF.
// Signatures, witness details and tick-box choices are deliberately not filled.
window.W2G_BUILTIN = [
  {
    key: 'ge-nbz-fnomi', name: 'GE Nominee / Trustee form (NBZ-FNOMI)', match: /NBZ-FNOMI/i,
    fields: [
      { page: 0, x: 408, y: 56, w: 175, h: 20, source: 'policyNo', mode: 'boxes' },
      { page: 0, x: 150, y: 85, w: 435, h: 20, source: 'name', mode: 'boxes' },
      { page: 0, x: 150, y: 101, w: 210, h: 20, source: 'nric12', mode: 'boxes' },
      { page: 1, x: 408, y: 46, w: 175, h: 30, source: 'policyNo', mode: 'boxes' },
      { page: 2, x: 408, y: 46, w: 175, h: 30, source: 'policyNo', mode: 'boxes' },
      { page: 2, x: 78, y: 333, w: 90, h: 14, source: 'name', mode: 'text' },
      { page: 3, x: 408, y: 40, w: 175, h: 22, source: 'policyNo', mode: 'boxes' },
      { page: 3, x: 74, y: 757, w: 92, h: 14, source: 'name', mode: 'text' },
      { page: 4, x: 408, y: 40, w: 175, h: 22, source: 'policyNo', mode: 'boxes' },
    ],
  },
  {
    key: 'ge-csd-psf33', name: 'GE Withdrawal / Surrender form (CSD-PSF33)', match: /CSD-PSF33/i,
    fields: [
      { page: 0, x: 78, y: 74, w: 160, h: 22, source: 'policyNo', mode: 'boxes' },
      { page: 0, x: 350, y: 74, w: 230, h: 22, source: 'nric12', mode: 'boxes' },
      { page: 0, x: 155, y: 119, w: 415, h: 13, source: 'name', mode: 'text' },
      { page: 3, x: 230, y: 334, w: 170, h: 24, source: 'today8', mode: 'boxes' },
      { page: 3, x: 100, y: 427, w: 115, h: 12, source: 'name', mode: 'text' },
      { page: 3, x: 116, y: 439, w: 100, h: 12, source: 'nric', mode: 'text' },
      { page: 3, x: 106, y: 451, w: 110, h: 12, source: 'phone', mode: 'text' },
    ],
  },
];

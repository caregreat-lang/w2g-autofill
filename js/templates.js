/* W2G AutoFill: the two built-in Great Eastern forms.
 * Positions are in PDF points from the bottom-left of the page: cells are [x, y, w, h]; text is [x, y, w, h] with y on the writing line.
 * Box positions were found with js/boxes.js on the blank forms. Anything the client must decide or sign is left out on purpose. */
(function (root) {
  const row = (x, y, w, h, n, step) => Array.from({ length: n }, (_, i) => [+(x + i * step).toFixed(1), y, w, h]);
  const polBoxes = (x, y) => row(x, y, 13.6, 15.6, 10, 14.38);

  const BUILTIN = [
    {
      id: 'ge-csd-psf33',
      name: 'CSD-PSF33 Withdrawal / Surrender (ILP)',
      short: 'CSD-PSF33 Surrender form',
      builtin: true,
      pdf: 'CSD-PSF33-V18-042026.pdf',
      fields: [
        { id: 'p1-pol', label: 'Policy No.', page: 1, kind: 'boxes', source: 'policyNo', cells: row(81.5, 747.8, 13.6, 15.8, 10, 14.4) },
        { id: 'p1-nric', label: 'New NRIC No. (Life Assured)', page: 1, kind: 'boxes', source: 'laNric',
          cells: [...row(357.5, 747, 13.6, 16, 6, 14.4), ...row(458.3, 747, 13.6, 16, 2, 14.5), ...row(501.5, 747, 13.6, 16, 4, 14.33)] },
        { id: 'p1-la', label: 'Name of Life Assured', page: 1, kind: 'text', source: 'laName', rect: [153, 713, 402, 12] },
        { id: 'p4-dd', label: 'Date: day', page: 4, kind: 'boxes', source: 'today.dd', cells: [[237.3, 490, 13.8, 15.8], [251.8, 490, 13.5, 15.8]] },
        { id: 'p4-mm', label: 'Date: month', page: 4, kind: 'boxes', source: 'today.mm', cells: [[280.5, 490, 13.5, 15.8], [294.8, 490, 13.8, 15.8]] },
        { id: 'p4-yy', label: 'Date: year', page: 4, kind: 'boxes', source: 'today.yyyy', cells: [[323.8, 490, 13.5, 15.8], [338, 490, 13.8, 15.8], [352.5, 490, 13.5, 15.8], [366.8, 490, 13.8, 15.8]] },
        { id: 'p4-name', label: 'Policy Owner name', page: 4, kind: 'text', source: 'name', rect: [101, 406, 108, 11] },
        { id: 'p4-nric', label: 'Policy Owner NRIC', page: 4, kind: 'text', source: 'nricDash', rect: [121, 394.5, 88, 11] },
        { id: 'p4-tel', label: 'Policy Owner Tel No.', page: 4, kind: 'text', source: 'phone', rect: [108, 382, 101, 11] }
      ]
    },
    {
      id: 'ge-nbz-fnomi',
      name: 'NBZ-FNOMI Appointment / Change of Nominee',
      short: 'NBZ-FNOMI Nominee form',
      builtin: true,
      pdf: 'NBZ-FNOMI-V07-082025.pdf',
      fields: [
        { id: 'p1-pol', label: 'Policy No.', page: 1, kind: 'boxes', source: 'policyNo', cells: row(417.8, 766.8, 14, 15.3, 10, 14.41) },
        { id: 'p1-name', label: 'Full Name as per NRIC/Passport', page: 1, kind: 'boxes', source: 'name', cells: row(168.5, 739.8, 14, 14, 27, 14.39) },
        { id: 'p1-nric', label: 'NRIC (12 digits) / Passport No.', page: 1, kind: 'boxes', source: 'nric', cells: row(168.5, 722.3, 14, 14, 12, 14.38) },
        { id: 'p1-muslim-no', label: 'Muslim? No', page: 1, kind: 'tick', source: 'muslim', when: 'No', cells: [[448.8, 725.3, 8.3, 8.3]] },
        { id: 'p1-muslim-yes', label: 'Muslim? Yes', page: 1, kind: 'tick', source: 'muslim', when: 'Yes', cells: [[488.5, 725.3, 8.3, 8.3]] },
        { id: 'p2-pol', label: 'Policy No. (page 2)', page: 2, kind: 'boxes', source: 'policyNo', cells: polBoxes(417.5, 776) },
        { id: 'p3-pol', label: 'Policy No. (page 3)', page: 3, kind: 'boxes', source: 'policyNo', cells: polBoxes(418, 780.5) },
        { id: 'p3-name', label: 'Proposer / Policyowner name', page: 3, kind: 'text', source: 'name', rect: [78, 500, 84, 11] },
        { id: 'p4-pol', label: 'Policy No. (page 4)', page: 4, kind: 'boxes', source: 'policyNo', cells: polBoxes(416.5, 782.5) },
        { id: 'p4-name', label: 'Proposer / Policyowner name', page: 4, kind: 'text', source: 'name', rect: [67, 76, 84, 11] },
        { id: 'p5-pol', label: 'Policy No. (page 5)', page: 5, kind: 'boxes', source: 'policyNo', cells: polBoxes(417, 781.5) }
      ]
    }
  ];

  const api = { BUILTIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.W2GTemplates = api;
})(typeof self !== 'undefined' ? self : this);

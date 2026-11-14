/**
 * Sélection de codes CIM-10 courants (classification internationale de l'OMS) proposée en suggestion de saisie.
 * Ce n'est PAS le référentiel complet : il sera servi par l'API (voir docs/API_CONTRACTS_NEEDED.md).
 * Le format du code reste contrôlé (ICD10_PATTERN) ; le libellé clinique est toujours saisi par le médecin.
 */
export const ICD10_SUGGESTIONS: readonly { code: string; title: string }[] = [
  { code: 'A01.0', title: 'Typhoid fever' },
  { code: 'A09', title: 'Diarrhoea and gastroenteritis of presumed infectious origin' },
  { code: 'A15', title: 'Respiratory tuberculosis, bacteriologically and histologically confirmed' },
  { code: 'B20', title: 'HIV disease resulting in infectious and parasitic diseases' },
  { code: 'B50', title: 'Plasmodium falciparum malaria' },
  { code: 'B54', title: 'Unspecified malaria' },
  { code: 'D50.9', title: 'Iron deficiency anaemia, unspecified' },
  { code: 'E11', title: 'Type 2 diabetes mellitus' },
  { code: 'I10', title: 'Essential (primary) hypertension' },
  { code: 'J06.9', title: 'Acute upper respiratory infection, unspecified' },
  { code: 'J18.9', title: 'Pneumonia, unspecified' },
  { code: 'J45', title: 'Asthma' },
  { code: 'K29.7', title: 'Gastritis, unspecified' },
  { code: 'M54.5', title: 'Low back pain' },
  { code: 'N39.0', title: 'Urinary tract infection, site not specified' },
  { code: 'R50.9', title: 'Fever, unspecified' },
  { code: 'R51', title: 'Headache' },
  { code: 'Z34', title: 'Supervision of normal pregnancy' },
];

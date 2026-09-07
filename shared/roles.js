// Catálogo de representantes disponibles para una constelación familiar.
// `gender` define la silueta 3D: m = masculino, f = femenino, n = neutro/abstracto.

export const GENDER_COLORS = {
  m: '#5b8def',
  f: '#e0709b',
  n: '#e0a458',
};

export const ROLE_GROUPS = [
  {
    key: 'nucleo',
    label: 'Núcleo',
    roles: [
      { key: 'consultante', label: 'Consultante', gender: 'n', short: 'YO' },
      { key: 'padre', label: 'Padre', gender: 'm', short: 'PA' },
      { key: 'madre', label: 'Madre', gender: 'f', short: 'MA' },
      { key: 'hijo', label: 'Hijo', gender: 'm', short: 'HO' },
      { key: 'hija', label: 'Hija', gender: 'f', short: 'HA' },
      { key: 'hermano', label: 'Hermano', gender: 'm', short: 'HNO' },
      { key: 'hermana', label: 'Hermana', gender: 'f', short: 'HNA' },
    ],
  },
  {
    key: 'ascendientes',
    label: 'Ascendientes',
    roles: [
      { key: 'abuelo_paterno', label: 'Abuelo paterno', gender: 'm', short: 'ABP' },
      { key: 'abuela_paterna', label: 'Abuela paterna', gender: 'f', short: 'ABP' },
      { key: 'abuelo_materno', label: 'Abuelo materno', gender: 'm', short: 'ABM' },
      { key: 'abuela_materna', label: 'Abuela materna', gender: 'f', short: 'ABM' },
      { key: 'bisabuelo', label: 'Bisabuelo', gender: 'm', short: 'BIS' },
      { key: 'bisabuela', label: 'Bisabuela', gender: 'f', short: 'BIS' },
      { key: 'tatarabuelo', label: 'Tatarabuelo', gender: 'm', short: 'TAT' },
      { key: 'tatarabuela', label: 'Tatarabuela', gender: 'f', short: 'TAT' },
      { key: 'ancestro', label: 'Ancestro / linaje', gender: 'n', short: 'ANC' },
    ],
  },
  {
    key: 'colaterales',
    label: 'Colaterales',
    roles: [
      { key: 'tio', label: 'Tío', gender: 'm', short: 'TIO' },
      { key: 'tia', label: 'Tía', gender: 'f', short: 'TIA' },
      { key: 'primo', label: 'Primo', gender: 'm', short: 'PRI' },
      { key: 'prima', label: 'Prima', gender: 'f', short: 'PRI' },
      { key: 'sobrino', label: 'Sobrino', gender: 'm', short: 'SOB' },
      { key: 'sobrina', label: 'Sobrina', gender: 'f', short: 'SOB' },
      { key: 'cunado', label: 'Cuñado', gender: 'm', short: 'CUÑ' },
      { key: 'cunada', label: 'Cuñada', gender: 'f', short: 'CUÑ' },
    ],
  },
  {
    key: 'descendientes',
    label: 'Descendientes',
    roles: [
      { key: 'nieto', label: 'Nieto', gender: 'm', short: 'NIE' },
      { key: 'nieta', label: 'Nieta', gender: 'f', short: 'NIE' },
      { key: 'bisnieto', label: 'Bisnieto', gender: 'm', short: 'BIN' },
      { key: 'bisnieta', label: 'Bisnieta', gender: 'f', short: 'BIN' },
      { key: 'hijo_no_nacido', label: 'Hijo no nacido', gender: 'n', short: 'HNN' },
    ],
  },
  {
    key: 'vinculos',
    label: 'Vínculos',
    roles: [
      { key: 'pareja', label: 'Pareja', gender: 'n', short: 'PAR' },
      { key: 'esposo', label: 'Esposo', gender: 'm', short: 'ESP' },
      { key: 'esposa', label: 'Esposa', gender: 'f', short: 'ESP' },
      { key: 'expareja', label: 'Ex pareja', gender: 'n', short: 'EX' },
      { key: 'amigo', label: 'Amigo', gender: 'm', short: 'AMI' },
      { key: 'amiga', label: 'Amiga', gender: 'f', short: 'AMI' },
      { key: 'padrastro', label: 'Padrastro', gender: 'm', short: 'PDR' },
      { key: 'madrastra', label: 'Madrastra', gender: 'f', short: 'MDR' },
      { key: 'adoptivo', label: 'Familia adoptiva', gender: 'n', short: 'ADO' },
    ],
  },
  {
    key: 'sistemicos',
    label: 'Elementos sistémicos',
    roles: [
      { key: 'sintoma', label: 'Síntoma / enfermedad', gender: 'n', short: 'SIN' },
      { key: 'excluido', label: 'Excluido del sistema', gender: 'n', short: 'EXC' },
      { key: 'recurso', label: 'Recurso / fuerza', gender: 'n', short: 'REC' },
      { key: 'dinero', label: 'Dinero / trabajo', gender: 'n', short: 'DIN' },
      { key: 'destino', label: 'Destino', gender: 'n', short: 'DES' },
      { key: 'muerte', label: 'Muerte', gender: 'n', short: 'MUE' },
      { key: 'patria', label: 'Patria / tierra', gender: 'n', short: 'PAT' },
      { key: 'observador', label: 'Observador', gender: 'n', short: 'OBS' },
      { key: 'abstracto', label: 'Elemento libre', gender: 'n', short: '···' },
    ],
  },
];

export const ROLES_BY_KEY = Object.fromEntries(
  ROLE_GROUPS.flatMap((g) => g.roles.map((r) => [r.key, { ...r, group: g.key }])),
);

export function roleColor(roleKey) {
  const role = ROLES_BY_KEY[roleKey];
  return GENDER_COLORS[role?.gender ?? 'n'];
}

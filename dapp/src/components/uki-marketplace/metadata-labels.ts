export function ukiRarityLabel(value: string | null | undefined) {
  return ({
    common: 'Común',
    uncommon: 'No común',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Legendario',
    goat: 'Goat',
    unknown: 'Rareza sin identificar',
  } as Record<string, string>)[value ?? ''] ?? 'Rareza sin identificar';
}

export function ukiGenerationLabel(value: string | null | undefined) {
  return ({
    original: 'Original',
    second_generation: 'Segunda generación',
    unknown: 'Generación sin identificar',
  } as Record<string, string>)[value ?? ''] ?? 'Generación sin identificar';
}

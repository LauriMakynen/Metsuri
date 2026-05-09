export type BackendMarkingType = 'vesakonhoito' | 'istutus' | 'harvennus' | 'avohakkuu' | 'muu_tyo';

export interface FollowUpRecommendation {
  followUpDateStart: string | null;
  followUpDateEnd: string | null;
  followUpNote: string;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addYears(dateString: string, years: number): string | null {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setFullYear(date.getFullYear() + years);
  return toIsoDate(date);
}

export function getFollowUpRecommendation(
  type: BackendMarkingType,
  operationDate: string
): FollowUpRecommendation {
  // Follow-up intervals are indicative defaults and should later be configurable by forest type, site type, tree species and local recommendations.
  const defaultNote = 'Tarkista työn vaikutus ja mahdollinen jatkotoimenpiteen tarve.';

  if (!operationDate) {
    return {
      followUpDateStart: null,
      followUpDateEnd: null,
      followUpNote: defaultNote,
    };
  }

  const normalizedType = type;

  if (normalizedType === 'istutus') {
    return {
      followUpDateStart: addYears(operationDate, 1),
      followUpDateEnd: addYears(operationDate, 2),
      followUpNote:
        'Tarkista taimien eloonjäänti, täydennysistutustarve ja heinän tai vesakon kilpailu noin 1-2 vuoden kuluttua.',
    };
  }

  if (normalizedType === 'vesakonhoito') {
    return {
      followUpDateStart: addYears(operationDate, 2),
      followUpDateEnd: addYears(operationDate, 4),
      followUpNote:
        'Tarkista uusi vesominen ja taimikon kasvutilanne noin 2-4 vuoden kuluttua.',
    };
  }

  if (normalizedType === 'harvennus') {
    return {
      followUpDateStart: addYears(operationDate, 3),
      followUpDateEnd: addYears(operationDate, 5),
      followUpNote:
        'Metsän kunto kannattaa tarkastaa noin 3-5 vuoden kuluttua (korjuujälki, puuston kunto, tuulituhot, ajourat ja kasvutilanne).',
    };
  }

  if (normalizedType === 'avohakkuu') {
    return {
      followUpDateStart: addYears(operationDate, 1),
      followUpDateEnd: addYears(operationDate, 2),
      followUpNote:
        'Varmista uudistamisen eteneminen ja suunnittele istutus tai kylvö, jos sitä ei ole vielä tehty.',
    };
  }

  return {
    followUpDateStart: addYears(operationDate, 1),
    followUpDateEnd: addYears(operationDate, 1),
    followUpNote: defaultNote,
  };
}

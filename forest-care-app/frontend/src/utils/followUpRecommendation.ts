import type { MarkingType } from '../types';
import { addYears } from './dateFormatting';

export interface FollowUpRecommendation {
  followUpDateStart: string | null;
  followUpDateEnd: string | null;
  followUpNote: string;
}

export function getFollowUpRecommendation(
  type: MarkingType,
  operationDate: string
): FollowUpRecommendation {
  // Follow-up intervals are indicative defaults and should later be configurable by forest type, site type, tree species and local recommendations.
  if (!operationDate) {
    return {
      followUpDateStart: null,
      followUpDateEnd: null,
      followUpNote: 'Tarkista työn vaikutus ja mahdollinen jatkotoimenpiteen tarve.',
    };
  }

  if (type === 'istutus') {
    return {
      followUpDateStart: addYears(operationDate, 1),
      followUpDateEnd: addYears(operationDate, 2),
      followUpNote:
        'Tarkista taimien eloonjäänti, täydennysistutustarve ja heinän tai vesakon kilpailu noin 1-2 vuoden kuluttua.',
    };
  }

  if (type === 'vesakonhoito') {
    return {
      followUpDateStart: addYears(operationDate, 2),
      followUpDateEnd: addYears(operationDate, 4),
      followUpNote: 'Tarkista uusi vesominen ja taimikon kasvutilanne noin 2-4 vuoden kuluttua.',
    };
  }

  if (type === 'harvennus') {
    return {
      followUpDateStart: addYears(operationDate, 3),
      followUpDateEnd: addYears(operationDate, 5),
      followUpNote:
        'Metsän kunto kannattaa tarkastaa noin 3-5 vuoden kuluttua (korjuujälki, puuston kunto, tuulituhot, ajourat ja kasvutilanne).',
    };
  }

  if (type === 'avohakkuu') {
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
    followUpNote: 'Tarkista työn vaikutus ja mahdollinen jatkotoimenpiteen tarve.',
  };
}

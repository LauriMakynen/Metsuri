import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/TopNav';
import Illustration from '../components/Illustration';

type GuideItem = {
  title: string;
  description: string;
};

type GuideSection = {
  id: string;
  title: string;
  items: GuideItem[];
  note?: string;
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'first-steps',
    title: 'Mitä tehdä ensiksi?',
    items: [
      {
        title: 'Tutustu omaan metsäkiinteistöön',
        description: 'Selvitä kiinteistön rajat, sijainti ja pinta-ala.',
      },
      {
        title: 'Selvitä, millaista metsää omistat',
        description: 'Tutustu metsän eri alueisiin, puulajeihin ja kehitysvaiheisiin.',
      },
      {
        title: 'Tarkista metsän aiemmat tiedot',
        description: 'Etsi mahdollinen metsäsuunnitelma ja selvitä, mitä metsänhoitotoimenpiteitä metsässä on aiemmin tehty.',
      },
      {
        title: 'Selvitä metsän hoitotarpeet',
        description: 'Arvioi, onko metsässä ajankohtaisia tai tulevaisuudessa tarvittavia toimenpiteitä.',
      },
      {
        title: 'Hyödynnä ammattilaisen apua',
        description: 'Metsäalan asiantuntija voi tarvittaessa auttaa arvioimaan metsän tilannetta ja suunnittelemaan tulevia töitä.',
      },
    ],
  },
  {
    id: 'forest-care',
    title: 'Metsänhoitotoimenpiteet',
    items: [
      {
        title: 'Metsän istutus ja uudistaminen',
        description: 'Uutta puustoa kasvatetaan esimerkiksi istuttamalla taimia tai hyödyntämällä luontaista uudistumista. Uudistaminen voi tulla ajankohtaiseksi, kun vanha puusto on hakattu tai metsikön uudistamista suunnitellaan.',
      },
      {
        title: 'Taimikonhoito',
        description: 'Nuoren metsän kasvua tuetaan huolehtimalla taimien kasvutilasta ja puulajisuhteista. Taimikonhoidon tarve kannattaa tarkistaa, kun taimet kasvavat ja alkavat kilpailla tilasta.',
      },
      {
        title: 'Harvennus',
        description: 'Osa puustosta poistetaan, jotta jäljelle jääville puille saadaan lisää kasvutilaa. Harvennus voi olla ajankohtainen, kun puusto on kasvanut tiheäksi.',
      },
      {
        title: 'Metsän hakkuu',
        description: 'Puustoa poistetaan esimerkiksi puun myyntiä tai metsän uudistamista varten. Hakkuun tarve ja toteutustapa riippuvat metsän tilanteesta ja omistajan tavoitteista.',
      },
      {
        title: 'Raivaus',
        description: 'Kasvua haittaavaa kasvillisuutta ja puustoa poistetaan metsänhoidon tarpeiden mukaan. Raivausta voidaan tehdä esimerkiksi taimikonhoidon tai muun metsätyön yhteydessä.',
      },
    ],
  },
  {
    id: 'annual-cycle',
    title: 'Metsänhoidon vuosikello',
    items: [
      {
        title: 'Talvi',
        description: 'Hakkuita ja puunkorjuuta olosuhteiden salliessa. Metsänhoitotöiden suunnittelua ja tulevien toimenpiteiden valmistelua.',
      },
      {
        title: 'Kevät',
        description: 'Istutusten suunnittelua ja toteutusta sopivana ajankohtana. Taimikonhoidon tarpeen tarkastelua ja metsän tilanteen arviointia.',
      },
      {
        title: 'Kesä',
        description: 'Istutusta, taimikonhoitoa ja metsän kasvun tarkastelua. Maastossa tehtyjä havaintoja voi kirjata myöhempää suunnittelua varten.',
      },
      {
        title: 'Syksy',
        description: 'Tulevien metsänhoitotöiden suunnittelua, hakkuiden valmistelua ja seuraavan vuoden tehtävien kartoittamista.',
      },
    ],
    note: 'Töiden ajankohdat vaihtelevat metsän, kasvupaikan ja sääolosuhteiden mukaan. Vuosikello antaa yleiskuvan, ei ehdotonta aikataulua.',
  },
];

export default function ForestryGuidePage() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navigate = useNavigate();

  return (
    <div className="help-page guide-page">
      <TopNav />
      <main className="help-content">
        <button
          type="button"
          className="help-back-link"
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/start');
            }
          }}
        >
          ← Takaisin
        </button>
        <header className="help-header">
          <Illustration name="tree" size={96} className="help-header-illustration" />
          <p className="help-eyebrow">Metsänomistajan tietopaketti</p>
          <h1>Tietoa metsänhoidosta</h1>
          <p>
            Tutustu metsänhoidon perusteisiin, oman metsäsi tarkistamiseen ja vuoden aikana tehtäviin töihin.
          </p>
        </header>

        <section className="help-sections" aria-label="Tietoa metsänhoidosta">
          {GUIDE_SECTIONS.map((section) => {
            const isOpen = openSection === section.id;
            return (
              <article className={`help-section ${isOpen ? 'open' : ''}`} key={section.id}>
                <button
                  type="button"
                  className="help-section-toggle"
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  aria-expanded={isOpen}
                  aria-controls={`guide-${section.id}`}
                >
                  <span>{section.title}</span>
                  <span className="help-chevron" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="help-section-content" id={`guide-${section.id}`}>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item.title}>
                          <strong>{item.title}:</strong> {item.description}
                        </li>
                      ))}
                    </ul>
                    {section.note && <p className="help-note">{section.note}</p>}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}

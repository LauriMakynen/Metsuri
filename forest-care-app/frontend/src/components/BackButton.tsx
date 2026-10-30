import { useNavigate } from 'react-router-dom';

function hasUnsavedChanges() {
  const forms = document.querySelectorAll<HTMLFormElement>('form');
  return Array.from(forms).some((form) =>
    Array.from(form.elements).some((element) => {
      if (element instanceof HTMLInputElement) {
        return ['checkbox', 'radio'].includes(element.type)
          ? element.checked !== element.defaultChecked
          : element.value !== element.defaultValue;
      }
      if (element instanceof HTMLTextAreaElement) {
        return element.value !== element.defaultValue;
      }
      if (element instanceof HTMLSelectElement) {
        return Array.from(element.options).some((option) => option.selected !== option.defaultSelected);
      }
      return false;
    })
  );
}

// Back button for the left end of the top bar; shown on every page except the start page
export default function BackButton() {
  const navigate = useNavigate();

  const handleBack = () => {
    if (
      hasUnsavedChanges() &&
      !window.confirm('Sivulla on tallentamattomia muutoksia. Haluatko varmasti poistua?')
    ) {
      return;
    }

    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
    } else {
      // Opened directly (no in-app history): go to the start page
      navigate('/start');
    }
  };

  return (
    <button type="button" className="nav-back-btn" onClick={handleBack} aria-label="Takaisin" title="Takaisin edelliseen näkymään">
      <span className="nav-back-arrow" aria-hidden="true">←</span>
      <span className="nav-back-label">Takaisin</span>
    </button>
  );
}

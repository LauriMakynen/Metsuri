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
      navigate('/map');
    }
  };

  return (
    <div className="back-button-row">
      <button type="button" className="btn btn-primary back-button" onClick={handleBack} aria-label="Takaisin">
        <span aria-hidden="true">←</span>
        Takaisin
      </button>
    </div>
  );
}

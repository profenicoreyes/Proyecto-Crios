/* CRIOS Studio — renderer */
(function(){
  'use strict';

  function el(id) {
    return document.getElementById(id);
  }

  let searchQuery = '';

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function renderMissionBank(options) {
    const target = el('missionBankContent');
    if (!target) return;
    target.innerHTML = '';

    const missions = Array.isArray(options.missions) ? options.missions : [];
    const isInDraft = typeof options.isInDraft === 'function' ? options.isInDraft : () => false;
    const getCampaignLabel = typeof options.getCampaignLabel === 'function' ? options.getCampaignLabel : () => 'Sin categoría';
    const onAdd = typeof options.onAdd === 'function' ? options.onAdd : () => {};

    const searchContainer = document.createElement('div');
    searchContainer.className = 'mission-search';
    const searchInputId = 'mission-search-input';

    const searchLabel = document.createElement('label');
    searchLabel.setAttribute('for', searchInputId);
    searchLabel.className = 'sr-only';
    searchLabel.textContent = 'Buscar misiones';

    const searchInput = document.createElement('input');
    searchInput.id = searchInputId;
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar por nombre...';
    searchInput.value = searchQuery;
    searchInput.autocomplete = 'off';
    searchInput.addEventListener('input', event => {
      searchQuery = event.target.value;
      renderMissionBank(options);
    });

    searchContainer.appendChild(searchLabel);
    searchContainer.appendChild(searchInput);
    target.appendChild(searchContainer);

    const filteredMissions = missions
      .slice()
      .sort((a, b) => {
        const nameA = normalizeText(a.nombreCorto || a.titulo || a.id || '');
        const nameB = normalizeText(b.nombreCorto || b.titulo || b.id || '');
        return nameA.localeCompare(nameB, undefined, { numeric: true });
      })
      .filter(m => {
        if (!searchQuery) return true;
        const name = normalizeText(m.nombreCorto || m.titulo || m.id || '');
        return name.indexOf(normalizeText(searchQuery)) !== -1;
      });

    const bankSection = document.getElementById('missionBank');
    if (bankSection) {
      const header = bankSection.querySelector('h2');
      if (header) header.textContent = 'Banco de misiones (' + filteredMissions.length + ')';
    }

    if (!filteredMissions.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No se encontraron misiones.';
      target.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'mini-list';

    filteredMissions.forEach(mission => {
      const item = document.createElement('li');
      item.className = 'mini mission-item';

      const content = document.createElement('div');
      content.className = 'mission-card';

      const title = document.createElement('div');
      title.className = 'mission-title';
      title.textContent = mission.nombreCorto || mission.titulo || mission.id;

      const badge = document.createElement('div');
      badge.className = 'mission-badge';
      badge.textContent = getCampaignLabel(mission.id);

      const metrics = document.createElement('div');
      metrics.className = 'mission-meta-line';
      metrics.textContent = 'Dificultad de misión ' + String(mission.dificultadNivel || 0) + '/6 · ' +
        String(mission.duracionMinutos || 0) + ' min';

      const curriculum = document.createElement('div');
      curriculum.className = 'mission-curriculum-line';
      curriculum.textContent = String(mission.curriculumLabel || 'Sin referencia curricular');

      content.appendChild(title);
      content.appendChild(badge);
      content.appendChild(metrics);
      content.appendChild(curriculum);

      const action = document.createElement('button');
      action.className = 'btn studio-btn';
      action.textContent = isInDraft(mission.id) ? 'Agregado' : 'Agregar';
      action.disabled = isInDraft(mission.id);
      action.addEventListener('click', () => onAdd(mission));

      item.appendChild(content);
      item.appendChild(action);
      list.appendChild(item);
    });

    target.appendChild(list);
  }

  function renderMetadata(options) {
    const section = document.getElementById('campaignBuilder');
    if (!section) return;

    let meta = section.querySelector('.campaign-meta');
    let nameInput = null;
    let descInput = null;
    let scenario = null;

    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'campaign-meta';

      const title = document.createElement('h3');
      title.textContent = 'Campaña';
      meta.appendChild(title);

      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Nombre de la campaña';
      nameLabel.htmlFor = 'campaign-name-input';
      meta.appendChild(nameLabel);

      nameInput = document.createElement('input');
      nameInput.id = 'campaign-name-input';
      nameInput.type = 'text';
      nameInput.placeholder = 'Escribí un nombre para la campaña';
      nameInput.addEventListener('input', (e) => {
        if (typeof options.alCambiarNombre === 'function') options.alCambiarNombre(e.target.value);
      });
      meta.appendChild(nameInput);

      const descLabel = document.createElement('label');
      descLabel.textContent = 'Descripción';
      descLabel.htmlFor = 'campaign-desc-input';
      meta.appendChild(descLabel);

      descInput = document.createElement('textarea');
      descInput.id = 'campaign-desc-input';
      descInput.rows = 3;
      descInput.placeholder = 'Describí brevemente el recorrido de aprendizaje';
      descInput.addEventListener('input', (e) => {
        if (typeof options.alCambiarDescripcion === 'function') options.alCambiarDescripcion(e.target.value);
      });
      meta.appendChild(descInput);

      const scenarioLabel = document.createElement('label');
      scenarioLabel.textContent = 'Escenario';
      meta.appendChild(scenarioLabel);

      scenario = document.createElement('div');
      scenario.className = 'campaign-scenario-selector';
      meta.appendChild(scenario);

      section.insertBefore(meta, section.firstChild);
    } else {
      nameInput = meta.querySelector('#campaign-name-input');
      descInput = meta.querySelector('#campaign-desc-input');
      scenario = meta.querySelector('.campaign-scenario-selector');
    }

    if (nameInput && nameInput.value !== (options.campaignName || '')) {
      nameInput.value = options.campaignName || '';
    }

    if (descInput && descInput.value !== (options.campaignDescription || '')) {
      descInput.value = options.campaignDescription || '';
    }

    if (scenario) {
      scenario.innerHTML = '';
      const escenarios = Array.isArray(options.escenarios) ? options.escenarios : [];
      const escenarioActual = String(options.campaignScenarioId || 'antartida');
      const alCambiar = typeof options.alCambiarEscenario === 'function' ? options.alCambiarEscenario : () => {};

      if (escenarios.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No hay escenarios disponibles.';
        scenario.appendChild(empty);
      } else {
        const container = document.createElement('div');
        container.className = 'scenario-buttons';

        escenarios.forEach(esc => {
          if (!esc || !esc.id) return;

          const btn = document.createElement('button');
          btn.className = 'btn scenario-option';
          if (String(esc.id) === escenarioActual) {
            btn.classList.add('scenario-active');
          }
          btn.setAttribute('data-scenario-id', String(esc.id));
          btn.textContent = esc.nombre || esc.id;
          if (esc.descripcion) {
            btn.title = esc.descripcion;
          }

          btn.addEventListener('click', () => {
            alCambiar(String(esc.id));
          });

          container.appendChild(btn);
        });

        scenario.appendChild(container);
      }
    }
  }

  function renderConfiguracion(options) {
    const section = document.getElementById('campaignBuilder');
    if (!section) return;

    let config = section.querySelector('.campaign-config');
    if (!config) {
      config = document.createElement('div');
      config.className = 'campaign-config';
      section.appendChild(config);
    }

    config.innerHTML = '';

    const indicators = options.campaignMissionIndicators || {};
    const curriculum = indicators.curriculum || { label: 'Sin misiones', status: 'empty' };
    const difficulty = Number(indicators.dificultadNivel) || 0;
    const duration = Number(indicators.duracionTotal) || 0;

    const title = document.createElement('div');
    title.className = 'config-title';
    title.textContent = 'Estimación automática';
    config.appendChild(title);

    const help = document.createElement('p');
    help.className = 'config-help';
    help.textContent = 'CRIOS deriva estos datos de las misiones seleccionadas. No requieren carga manual del docente.';
    config.appendChild(help);

    const grid = document.createElement('div');
    grid.className = 'derived-metadata-grid';

    const difficultyItem = document.createElement('div');
    difficultyItem.className = 'derived-metadata-item';
    difficultyItem.innerHTML = '<span>Dificultad estimada de campaña</span><strong>' +
      (difficulty > 0 ? difficulty.toFixed(1) + '/6' : '—') + '</strong>';

    const durationItem = document.createElement('div');
    durationItem.className = 'derived-metadata-item';
    durationItem.innerHTML = '<span>Duración estimada</span><strong>' +
      (duration > 0 ? String(duration) + ' min' : '—') + '</strong>';

    grid.appendChild(difficultyItem);
    grid.appendChild(durationItem);
    config.appendChild(grid);

    const curriculumTitle = document.createElement('div');
    curriculumTitle.className = 'derived-curriculum-title';
    curriculumTitle.textContent = 'Referencia curricular sugerida';
    config.appendChild(curriculumTitle);

    const curriculumValue = document.createElement('div');
    curriculumValue.className = 'derived-curriculum-value derived-curriculum-' + String(curriculum.status || 'incomplete');
    curriculumValue.textContent = String(curriculum.label || 'Metadatos curriculares no disponibles');
    config.appendChild(curriculumValue);

    if (curriculum.status === 'compatible' && Array.isArray(curriculum.subsistemas) && curriculum.subsistemas.length) {
      const systems = document.createElement('div');
      systems.className = 'derived-curriculum-detail';
      systems.textContent = 'Subsistemas: ' + curriculum.subsistemas.join(' / ');
      config.appendChild(systems);
    }
  }

  function renderDraft(options) {
    const target = el('campaignBuilderContent');
    if (!target) return;
    target.innerHTML = '';

    const draftMissions = Array.isArray(options.draftMissions) ? options.draftMissions : [];
    const onMove = typeof options.onMove === 'function' ? options.onMove : () => {};
    const onRemove = typeof options.onRemove === 'function' ? options.onRemove : () => {};
    const onMissionNote = typeof options.onMissionNote === 'function' ? options.onMissionNote : () => false;

    const header = document.createElement('div');
    header.className = 'draft-header';
    header.innerHTML = '<strong>Campaña temporal</strong>';
    target.appendChild(header);

    if (!draftMissions.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Arrastra las misiones aquí desde el banco o usa el botón Agregar.';
      target.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'mini-list';

    draftMissions.forEach((mission, index) => {
      const item = document.createElement('li');
      item.className = 'mini draft-item';

      const body = document.createElement('div');
      body.className = 'draft-mission-body';

      const title = document.createElement('div');
      title.className = 'mission-title';
      title.textContent = mission.nombreCorto || mission.titulo || mission.id;

      const details = document.createElement('div');
      details.className = 'draft-mission-details';
      details.textContent = 'Dificultad de misión ' + String(mission.dificultadNivel || 0) + '/6 · ' +
        String(mission.duracionMinutos || 0) + ' min · ' +
        String(mission.curriculumLabel || 'Sin referencia curricular');

      const noteLabel = document.createElement('label');
      noteLabel.className = 'mission-note-label';
      noteLabel.textContent = 'Nota docente (opcional)';

      const note = document.createElement('textarea');
      note.className = 'mission-note-input';
      note.rows = 2;
      note.maxLength = 500;
      note.value = String(mission.notaDocente || '');
      note.placeholder = 'Anotación específica para esta misión dentro de la campaña';
      note.addEventListener('input', () => onMissionNote(mission.id, note.value));

      noteLabel.appendChild(note);
      body.appendChild(title);
      body.appendChild(details);
      body.appendChild(noteLabel);

      const controls = document.createElement('div');
      controls.className = 'draft-controls';

      const up = document.createElement('button');
      up.className = 'btn studio-btn small';
      up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', () => onMove(index, -1));

      const down = document.createElement('button');
      down.className = 'btn studio-btn small';
      down.textContent = '↓';
      down.disabled = index === draftMissions.length - 1;
      down.addEventListener('click', () => onMove(index, 1));

      const remove = document.createElement('button');
      remove.className = 'btn studio-btn danger small';
      remove.textContent = 'Quitar';
      remove.addEventListener('click', () => onRemove(mission.id));

      controls.appendChild(up);
      controls.appendChild(down);
      controls.appendChild(remove);

      item.appendChild(body);
      item.appendChild(controls);
      list.appendChild(item);
    });

    target.appendChild(list);
  }

  function renderSummary(options) {
    const target = el('campaignSummaryContent');
    if (!target) return;
    target.innerHTML = '';

    const draftMissions = Array.isArray(options.draftMissions) ? options.draftMissions : [];
    const name = String(options.campaignName || '').trim();
    const scenario = String(options.campaignScenario || 'Sin seleccionar').trim();
    const indicators = options.campaignMissionIndicators || {};
    const dificultad = Number(indicators.dificultadNivel) || 0;
    const duracion = Number(indicators.duracionTotal) || 0;
    const curriculum = indicators.curriculum || { label: 'Sin misiones', status: 'empty' };
    const validacion = options.validacion || { estado: 'correcto', errores: [], advertencias: [] };
    const tieneErrores = validacion.estado === 'con errores';

    const title = document.createElement('div');
    title.className = 'summary-title';
    title.textContent = 'Campaña temporal';

    const nameItem = document.createElement('div');
    nameItem.className = 'summary-item';
    nameItem.textContent = 'Nombre: ' + (name || '(sin nombre)');

    const scenarioItem = document.createElement('div');
    scenarioItem.className = 'summary-item';
    scenarioItem.textContent = 'Escenario: ' + scenario;

    const dificultadItem = document.createElement('div');
    dificultadItem.className = 'summary-item';
    dificultadItem.textContent = 'Dificultad estimada de campaña: ' + (dificultad > 0 ? dificultad.toFixed(1) + '/6' : '—');

    const duracionItem = document.createElement('div');
    duracionItem.className = 'summary-item';
    duracionItem.textContent = 'Duración estimada: ' + (duracion > 0 ? duracion + ' min' : '—');

    const nivelItem = document.createElement('div');
    nivelItem.className = 'summary-item';
    nivelItem.textContent = 'Referencia curricular sugerida: ' + String(curriculum.label || 'Sin misiones');

    const items = document.createElement('div');
    items.className = 'summary-item';
    items.textContent = 'Misiones: ' + draftMissions.length;

    const status = document.createElement('div');
    status.className = 'summary-status';
    status.textContent = 'Estado: No publicada';

    target.appendChild(title);
    target.appendChild(nameItem);
    target.appendChild(scenarioItem);
    target.appendChild(dificultadItem);
    target.appendChild(duracionItem);
    target.appendChild(nivelItem);
    target.appendChild(items);
    target.appendChild(status);

    const statusSection = document.createElement('div');
    statusSection.className = 'campaign-status-section';
    statusSection.style.marginTop = '1.5em';
    statusSection.style.paddingTop = '1.5em';
    statusSection.style.borderTop = '1px solid #ddd';

    const statusHeader = document.createElement('div');
    statusHeader.className = 'status-header';
    statusHeader.style.display = 'flex';
    statusHeader.style.alignItems = 'center';
    statusHeader.style.gap = '0.5em';
    statusHeader.style.fontWeight = 'bold';
    statusHeader.style.marginBottom = '1em';

    const indicador = document.createElement('span');
    indicador.textContent = tieneErrores ? '🔴' : '🟢';

    const titulo = document.createElement('span');
    titulo.textContent = tieneErrores ? 'Requiere atención' : 'Lista para continuar';

    statusHeader.appendChild(indicador);
    statusHeader.appendChild(titulo);
    statusSection.appendChild(statusHeader);

    if (Array.isArray(validacion.errores) && validacion.errores.length > 0) {
      const erroresDiv = document.createElement('div');
      erroresDiv.style.marginBottom = '1em';

      const erroresTitle = document.createElement('div');
      erroresTitle.style.fontWeight = 'bold';
      erroresTitle.style.color = '#d32f2f';
      erroresTitle.style.marginBottom = '0.5em';
      erroresTitle.textContent = 'Errores';
      erroresDiv.appendChild(erroresTitle);

      const erroresList = document.createElement('ul');
      erroresList.style.margin = '0 0 0 1.5em';
      erroresList.style.color = '#d32f2f';
      validacion.errores.forEach(error => {
        const li = document.createElement('li');
        li.textContent = error;
        erroresList.appendChild(li);
      });
      erroresDiv.appendChild(erroresList);
      statusSection.appendChild(erroresDiv);
    }

    if (Array.isArray(validacion.advertencias) && validacion.advertencias.length > 0) {
      const advertenciasDiv = document.createElement('div');

      const advertenciasTitle = document.createElement('div');
      advertenciasTitle.style.fontWeight = 'bold';
      advertenciasTitle.style.color = '#f57f17';
      advertenciasTitle.style.marginBottom = '0.5em';
      advertenciasTitle.textContent = 'Advertencias';
      advertenciasDiv.appendChild(advertenciasTitle);

      const advertenciasList = document.createElement('ul');
      advertenciasList.style.margin = '0 0 0 1.5em';
      advertenciasList.style.color = '#f57f17';
      validacion.advertencias.forEach(adv => {
        const li = document.createElement('li');
        li.textContent = adv;
        advertenciasList.appendChild(li);
      });
      advertenciasDiv.appendChild(advertenciasList);
      statusSection.appendChild(advertenciasDiv);
    }

    target.appendChild(statusSection);
  }
  function ensurePublicationPanel() {
    const summarySection = document.getElementById('campaignSummary');
    if (!summarySection) return null;

    let panel = summarySection.querySelector('#studioPublicationPanel');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.id = 'studioPublicationPanel';
    panel.className = 'studio-publication-panel';

    const title = document.createElement('h3');
    title.className = 'studio-publication-title';
    title.textContent = 'Publicación';

    const status = document.createElement('div');
    status.id = 'studioPublicationStatus';
    status.className = 'studio-publication-status';

    const revision = document.createElement('div');
    revision.id = 'studioPublicationRevision';
    revision.className = 'studio-publication-revision';

    const actions = document.createElement('div');
    actions.className = 'studio-publication-actions';

    const validateButton = document.createElement('button');
    validateButton.id = 'studioPublicationValidateButton';
    validateButton.className = 'btn studio-btn';
    validateButton.type = 'button';
    validateButton.textContent = 'Validar borrador';

    const publishButton = document.createElement('button');
    publishButton.id = 'studioPublicationPublishButton';
    publishButton.className = 'btn studio-btn';
    publishButton.type = 'button';
    publishButton.textContent = 'Publicar versión';

    actions.appendChild(validateButton);
    actions.appendChild(publishButton);

    const summary = document.createElement('div');
    summary.id = 'studioPublicationValidationSummary';
    summary.className = 'studio-publication-validation-summary';

    const issues = document.createElement('ul');
    issues.id = 'studioPublicationIssues';
    issues.className = 'studio-publication-issues';

    const result = document.createElement('div');
    result.id = 'studioPublicationLastResult';
    result.className = 'studio-publication-result';

    const compatibilityTitle = document.createElement('h4');
    compatibilityTitle.className = 'studio-publication-history-title';
    compatibilityTitle.textContent = 'Compatibilidad de ejecución';

    const compatibilitySummary = document.createElement('div');
    compatibilitySummary.id = 'studioExecutionCompatibilitySummary';
    compatibilitySummary.className = 'studio-publication-result';

    const compatibilityMissions = document.createElement('ul');
    compatibilityMissions.id = 'studioExecutionCompatibilityMissions';
    compatibilityMissions.className = 'studio-publication-issues';

    const compatibilityIssues = document.createElement('ul');
    compatibilityIssues.id = 'studioExecutionCompatibilityIssues';
    compatibilityIssues.className = 'studio-publication-issues';

    const runtimeLimit = document.createElement('p');
    runtimeLimit.className = 'studio-publication-memory-notice';
    runtimeLimit.textContent = 'Cada publicación tiene un enlace propio e inmutable. Publicar otra versión no modifica los enlaces anteriores.';

    const runtimeLaunchTitle = document.createElement('h4');
    runtimeLaunchTitle.className = 'studio-publication-history-title';
    runtimeLaunchTitle.textContent = 'Acceso para estudiantes';

    const runtimeLaunchStatus = document.createElement('p');
    runtimeLaunchStatus.id = 'studioRuntimeLaunchStatus';
    runtimeLaunchStatus.className = 'studio-publication-memory-notice';

    const runtimeLaunchLink = document.createElement('a');
    runtimeLaunchLink.id = 'studioRuntimeLaunchLink';
    runtimeLaunchLink.className = 'btn studio-btn studio-runtime-launch-link';
    runtimeLaunchLink.textContent = 'Abrir campaña en CRIOS';
    runtimeLaunchLink.hidden = true;

    const historyTitle = document.createElement('h4');
    historyTitle.className = 'studio-publication-history-title';
    historyTitle.textContent = 'Historial de publicaciones';

    const notice = document.createElement('p');
    notice.id = 'studioPublicationPersistenceNotice';
    notice.className = 'studio-publication-memory-notice';
    notice.textContent = 'En memoria. Se pierde al recargar.';

    const persistenceTitle = document.createElement('h4');
    persistenceTitle.className = 'studio-publication-history-title';
    persistenceTitle.textContent = 'Persistencia local';

    const persistenceNotice = document.createElement('p');
    persistenceNotice.id = 'studioPersistenceNotice';
    persistenceNotice.className = 'studio-publication-memory-notice';

    const persistenceDetails = document.createElement('div');
    persistenceDetails.id = 'studioPersistenceDetails';
    persistenceDetails.className = 'studio-publication-result';

    const persistenceConsent = document.createElement('label');
    persistenceConsent.className = 'studio-persistence-consent';
    const persistenceCheckbox = document.createElement('input');
    persistenceCheckbox.id = 'studioPersistenceClearConsent';
    persistenceCheckbox.type = 'checkbox';
    const persistenceConsentText = document.createElement('span');
    persistenceConsentText.textContent = 'Acepto borrar los datos locales de publicación.';
    persistenceConsent.appendChild(persistenceCheckbox);
    persistenceConsent.appendChild(persistenceConsentText);

    const clearPersistenceButton = document.createElement('button');
    clearPersistenceButton.id = 'studioPersistenceClearButton';
    clearPersistenceButton.className = 'btn studio-btn danger';
    clearPersistenceButton.type = 'button';
    clearPersistenceButton.textContent = 'Borrar datos locales';
    clearPersistenceButton.disabled = true;

    const history = document.createElement('ul');
    history.id = 'studioPublicationHistory';
    history.className = 'studio-publication-history';

    panel.appendChild(title);
    panel.appendChild(status);
    panel.appendChild(revision);
    panel.appendChild(actions);
    panel.appendChild(summary);
    panel.appendChild(issues);
    panel.appendChild(result);
    panel.appendChild(compatibilityTitle);
    panel.appendChild(compatibilitySummary);
    panel.appendChild(compatibilityMissions);
    panel.appendChild(compatibilityIssues);
    panel.appendChild(runtimeLimit);
    panel.appendChild(runtimeLaunchTitle);
    panel.appendChild(runtimeLaunchStatus);
    panel.appendChild(runtimeLaunchLink);
    panel.appendChild(historyTitle);
    panel.appendChild(notice);
    panel.appendChild(history);
    panel.appendChild(persistenceTitle);
    panel.appendChild(persistenceNotice);
    panel.appendChild(persistenceDetails);
    panel.appendChild(persistenceConsent);
    panel.appendChild(clearPersistenceButton);

    summarySection.appendChild(panel);
    return panel;
  }

  function createPublicationRow(label, value) {
    const row = document.createElement('div');
    row.className = 'studio-publication-row';

    const key = document.createElement('span');
    key.className = 'studio-publication-key';
    key.textContent = label;

    const val = document.createElement('span');
    val.className = 'studio-publication-value';
    val.textContent = value;

    row.appendChild(key);
    row.appendChild(val);
    return row;
  }

  function renderPublicationPanel(config) {
    const panel = ensurePublicationPanel();
    if (!panel) return;

    const publication = config && config.publication ? config.publication : {};
    const state = publication.state || { status: 'IDLE', busy: false, currentDraftRevision: '' };
    const validation = state.lastValidation;
    const issues = validation && Array.isArray(validation.issues) ? validation.issues : [];
    const history = Array.isArray(publication.history) ? publication.history : [];
    const actions = publication.actions || {};
    const runtimeLaunch = config && config.runtimeLaunch ? config.runtimeLaunch : {};
    const runtimeLaunchState = runtimeLaunch.state || { available: false, status: 'NO_PUBLICATION', message: 'Publicá una versión para habilitar su enlace en CRIOS.', href: null, target: null, rel: null };
    const persistence = config && config.persistence ? config.persistence : {};
    const persistenceState = persistence.state || { status: 'UNAVAILABLE', busy: false };
    const persistenceActions = persistence.actions || {};
    const missionSpecs = config && config.missionSpecs ? config.missionSpecs : {};
    const missionSpecState = missionSpecs.state || { status: 'IDLE', missionCount: 0, validSpecCount: 0, invalidSpecCount: 0, requiredHandlers: [], manifest: null, issues: [], lastValidation: null };

    const statusNode = panel.querySelector('#studioPublicationStatus');
    const revisionNode = panel.querySelector('#studioPublicationRevision');
    const validateButton = panel.querySelector('#studioPublicationValidateButton');
    const publishButton = panel.querySelector('#studioPublicationPublishButton');
    const summaryNode = panel.querySelector('#studioPublicationValidationSummary');
    const issuesNode = panel.querySelector('#studioPublicationIssues');
    const resultNode = panel.querySelector('#studioPublicationLastResult');
    const historyNode = panel.querySelector('#studioPublicationHistory');
    const runtimeLaunchStatusNode = panel.querySelector('#studioRuntimeLaunchStatus');
    const runtimeLaunchLinkNode = panel.querySelector('#studioRuntimeLaunchLink');
    const publicationNoticeNode = panel.querySelector('#studioPublicationPersistenceNotice');
    const persistenceNoticeNode = panel.querySelector('#studioPersistenceNotice');
    const persistenceDetailsNode = panel.querySelector('#studioPersistenceDetails');
    const persistenceCheckbox = panel.querySelector('#studioPersistenceClearConsent');
    const clearPersistenceButton = panel.querySelector('#studioPersistenceClearButton');
    const compatibilitySummaryNode = panel.querySelector('#studioExecutionCompatibilitySummary');
    const compatibilityMissionsNode = panel.querySelector('#studioExecutionCompatibilityMissions');
    const compatibilityIssuesNode = panel.querySelector('#studioExecutionCompatibilityIssues');

    compatibilitySummaryNode.replaceChildren();
    compatibilitySummaryNode.appendChild(createPublicationRow('Estado', missionSpecState.status === 'READY' ? 'Lista para publicación ejecutable' : 'La campaña no puede ejecutarse desde una publicación'));
    compatibilitySummaryNode.appendChild(createPublicationRow('Misiones', String(missionSpecState.missionCount || 0)));
    compatibilitySummaryNode.appendChild(createPublicationRow('Specs válidas', String(missionSpecState.validSpecCount || 0)));
    compatibilitySummaryNode.appendChild(createPublicationRow('Specs inválidas', String(missionSpecState.invalidSpecCount || 0)));
    compatibilitySummaryNode.appendChild(createPublicationRow('runtimeContractVersion', String(missionSpecState.manifest && missionSpecState.manifest.runtimeContractVersion || 'Sin validar')));
    compatibilitySummaryNode.appendChild(createPublicationRow('Handlers requeridos', (missionSpecState.requiredHandlers || []).map(function(handler){return handler.handlerId + '@' + handler.handlerVersion;}).join(', ') || 'Sin validar'));
    compatibilitySummaryNode.appendChild(createPublicationRow('Manifiesto', missionSpecState.manifest ? 'Válido' : 'Sin validar'));
    compatibilitySummaryNode.appendChild(createPublicationRow('Evaluación final', missionSpecState.lastValidation && missionSpecState.lastValidation.finalEvaluation ? 'Válida' : 'Sin validar'));

    compatibilityMissionsNode.replaceChildren();
    const currentSpecs = missionSpecState.lastValidation && Array.isArray(missionSpecState.lastValidation.specs) ? missionSpecState.lastValidation.specs : [];
    currentSpecs.forEach(function(spec){
      const item = document.createElement('li');
      item.textContent = spec.missionId + ' · ' + spec.handlerId + '@' + spec.handlerVersion + ' · válida';
      compatibilityMissionsNode.appendChild(item);
    });
    compatibilityIssuesNode.replaceChildren();
    const compatibilityIssueList = Array.isArray(missionSpecState.issues) ? missionSpecState.issues : [];
    compatibilityIssueList.forEach(function(item){
      const node = document.createElement('li');
      node.textContent = String(item.code || 'MISSION_SPEC_INVALID') + ': ' + String(item.message || 'Incidencia de compatibilidad.');
      compatibilityIssuesNode.appendChild(node);
    });

    const persistenceReady = persistenceState.status === 'READY' || persistenceState.status === 'EMPTY';
    const persistenceMessage = persistenceReady
      ? 'Guardado solo en este navegador. No se sincroniza con la nube.'
      : 'Persistencia no disponible. Studio continúa en memoria y los cambios se pierden al recargar.';
    publicationNoticeNode.textContent = persistenceMessage;
    persistenceNoticeNode.textContent = persistenceMessage;
    persistenceNoticeNode.className = 'studio-publication-memory-notice' + (persistenceReady ? '' : ' studio-persistence-warning');
    persistenceDetailsNode.innerHTML = '';
    persistenceDetailsNode.appendChild(createPublicationRow('Estado', String(persistenceState.status || 'UNAVAILABLE')));
    persistenceDetailsNode.appendChild(createPublicationRow('Última actualización', String(persistenceState.updatedAt || 'Sin datos')));
    persistenceDetailsNode.appendChild(createPublicationRow('Tamaño', String(persistenceState.serializedBytes || 0) + ' bytes'));
    persistenceDetailsNode.appendChild(createPublicationRow('Publicaciones', String(persistenceState.publicationCount || 0)));
    if (persistenceState.lastError) {
      persistenceDetailsNode.appendChild(createPublicationRow('Error', String(persistenceState.lastError.code || 'PERSISTENCE_ERROR') + ': ' + String(persistenceState.lastError.message || 'Error de persistencia.')));
    }
    persistenceCheckbox.disabled = Boolean(persistenceState.busy);
    persistenceCheckbox.checked = false;
    clearPersistenceButton.disabled = true;
    persistenceCheckbox.onchange = function(){
      clearPersistenceButton.disabled = Boolean(persistenceState.busy) || !persistenceCheckbox.checked;
    };
    clearPersistenceButton.onclick = function(){
      if (persistenceCheckbox.checked && typeof persistenceActions.onClear === 'function') persistenceActions.onClear();
    };

    statusNode.textContent = 'Estado: ' + String(state.status || 'IDLE');
    revisionNode.textContent = 'Revisión del borrador: ' + String(state.currentDraftRevision || '');

    validateButton.disabled = Boolean(state.busy);
    publishButton.disabled = Boolean(state.busy);
    runtimeLaunchStatusNode.textContent = String(runtimeLaunchState.message || '');
    runtimeLaunchStatusNode.dataset.status = String(runtimeLaunchState.status || '');
    runtimeLaunchLinkNode.hidden = !runtimeLaunchState.available;
    if (runtimeLaunchState.available) {
      runtimeLaunchLinkNode.href = String(runtimeLaunchState.href || '');
      runtimeLaunchLinkNode.target = String(runtimeLaunchState.target || '_blank');
      runtimeLaunchLinkNode.rel = String(runtimeLaunchState.rel || 'noopener');
      runtimeLaunchLinkNode.dataset.campaignId = String(runtimeLaunchState.campaignId || '');
      runtimeLaunchLinkNode.dataset.publicationId = String(runtimeLaunchState.publicationId || '');
    } else {
      runtimeLaunchLinkNode.removeAttribute('href');
      runtimeLaunchLinkNode.removeAttribute('target');
      runtimeLaunchLinkNode.removeAttribute('rel');
      delete runtimeLaunchLinkNode.dataset.campaignId;
      delete runtimeLaunchLinkNode.dataset.publicationId;
    }

    validateButton.onclick = function(){ if (typeof actions.onValidate === 'function') actions.onValidate(); };
    publishButton.onclick = function(){ if (typeof actions.onPublish === 'function') actions.onPublish(); };

    const errorCount = issues.filter(issue => issue && issue.severity === 'ERROR').length;
    const warningCount = issues.filter(issue => issue && issue.severity === 'WARNING').length;
    const infoCount = issues.filter(issue => issue && issue.severity === 'INFO').length;

    summaryNode.innerHTML = '';
    summaryNode.appendChild(createPublicationRow('Errores', String(errorCount)));
    summaryNode.appendChild(createPublicationRow('Advertencias', String(warningCount)));
    summaryNode.appendChild(createPublicationRow('Info', String(infoCount)));

    issuesNode.innerHTML = '';
    if (issues.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'studio-publication-issue studio-publication-issue-info';
      empty.textContent = 'Sin incidencias para mostrar.';
      issuesNode.appendChild(empty);
    } else {
      issues.forEach(issue => {
        const li = document.createElement('li');
        const severity = String(issue && issue.severity || 'INFO').toLowerCase();
        li.className = 'studio-publication-issue studio-publication-issue-' + severity;
        li.textContent = '[' + String(issue.code || 'UNKNOWN') + '] ' + String(issue.message || 'Incidencia sin detalle.');
        issuesNode.appendChild(li);
      });
    }

    resultNode.innerHTML = '';
    const lastResult = state.lastResult;
    if (!lastResult) {
      resultNode.textContent = 'Sin resultados de publicación en esta sesión.';
    } else if (lastResult.success) {
      resultNode.appendChild(createPublicationRow('campaignId', String(lastResult.publication && lastResult.publication.campaignId || '')));
      resultNode.appendChild(createPublicationRow('publicationId', String(lastResult.publication && lastResult.publication.publicationId || '')));
      resultNode.appendChild(createPublicationRow('version', String(lastResult.publication && lastResult.publication.version || '')));
      resultNode.appendChild(createPublicationRow('schemaVersion', String(lastResult.publication && lastResult.publication.schemaVersion || '')));
      resultNode.appendChild(createPublicationRow('contentHash', String(lastResult.publication && lastResult.publication.contentHash || '')));
      resultNode.appendChild(createPublicationRow('createdAt', String(lastResult.record && lastResult.record.createdAt || '')));
      resultNode.appendChild(createPublicationRow('sourceDraftRevision', String(lastResult.record && lastResult.record.sourceDraftRevision || '')));
    } else {
      resultNode.appendChild(createPublicationRow('error.code', String(lastResult.error && lastResult.error.code || 'ERROR')));
      resultNode.appendChild(createPublicationRow('error.message', String(lastResult.error && lastResult.error.message || 'Publicación fallida.')));
    }

    historyNode.innerHTML = '';
    if (history.length === 0) {
      const emptyHistory = document.createElement('li');
      emptyHistory.className = 'studio-publication-history-empty';
      emptyHistory.textContent = 'Sin publicaciones para la campaña actual.';
      historyNode.appendChild(emptyHistory);
    } else {
      history.forEach(item => {
        const row = document.createElement('li');
        row.className = 'studio-publication-history-item';
        const shortHash = String(item.contentHash || '').slice(0, 12);
        const publicationText = document.createElement('span');
        publicationText.className = 'studio-publication-history-text';
        publicationText.textContent = 'v' + String(item.version || '') + ' · ' + String(item.publicationId || '') + ' · ' + shortHash + ' · ' + String(item.contentHash || '') + ' · rev ' + String(item.sourceDraftRevision || '') + ' · ' + String(item.createdAt || '');
        row.appendChild(publicationText);

        historyNode.appendChild(row);
      });
    }
  }
  function render(config) {
    const missions = Array.isArray(config.missions) ? config.missions : [];

    renderMissionBank({
      missions,
      isInDraft: config.isInDraft,
      getCampaignLabel: config.getCampaignLabel,
      onAdd: config.onAdd
    });
    renderMetadata({
      campaignName: config.campaignName,
      campaignDescription: config.campaignDescription,
      campaignScenarioId: config.campaignScenarioId,
      escenarios: Array.isArray(config.escenarios) ? config.escenarios : [],
      alCambiarNombre: config.alCambiarNombre,
      alCambiarDescripcion: config.alCambiarDescripcion,
      alCambiarEscenario: config.alCambiarEscenario
    });
    renderConfiguracion({
      campaignMissionIndicators: config.campaignMissionIndicators || {}
    });
    renderDraft({
      draftMissions: Array.isArray(config.draftMissions) ? config.draftMissions : [],
      onMove: config.onMove,
      onRemove: config.onRemove,
      onMissionNote: config.onMissionNote
    });
    renderSummary({
      campaignName: config.campaignName,
      campaignScenario: config.campaignScenario,
      campaignMissionIndicators: config.campaignMissionIndicators || {},
      draftMissions: Array.isArray(config.draftMissions) ? config.draftMissions : [],
      validacion: config.validacion
    });

    renderPublicationPanel({
      publication: config.publication || null,
      runtimeLaunch: config.runtimeLaunch || null,
      persistence: config.persistence || null
    });
  }

  window.CRIOS_STUDIO_RENDERER = {
    render
  };
})();


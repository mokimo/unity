import {
  createTag,
  getUnityLibs,
  getGuestAccessToken,
  loadImg,
  createActionBtn,
  loadSvg,
  decorateDefaultLinkAnalytics,
  createIntersectionObserver,
} from '../../../scripts/utils.js';
import { uploadAsset } from '../../steps/upload-step.js';
import initAppConnector from '../../steps/app-connector.js';
import createUpload from '../../steps/upload-btn.js';

function resetWorkflowState(cfg) {
  cfg.presentState = {
    activeIdx: -1,
    removeBgState: {
      assetId: null,
      assetUrl: null,
    },
    changeBgState: {},
    adjustments: {},
  };
  cfg.preludeState = { assetId: null, adjustments: {} };
  const img = cfg.targetEl.querySelector(':scope > picture img');
  img.style.filter = '';
}

function toggleDisplay(domEl) {
  if (domEl.classList.contains('show')) domEl.classList.remove('show');
  else domEl.classList.add('show');
}

async function addProductIcon(cfg) {
  const { unityEl, unityWidget, targetEl, refreshWidgetEvent } = cfg;
  cfg.refreshEnabled = false;
  const refreshCfg = unityEl.querySelector('.icon-product-icon');
  if (!refreshCfg) return;
  const [prodIcon, refreshIcon] = refreshCfg.closest('li').querySelectorAll('img[src*=".svg"]');
  const unityOrigin = getUnityLibs().split('/unitylibs')[0];
  prodIcon.src = `${unityOrigin}${new URL(prodIcon.src).pathname}`;
  const iconHolder = createTag('div', { class: 'widget-product-icon show' }, prodIcon);
  const refreshSvg = await loadSvg(`${unityOrigin}${new URL(refreshIcon.src).pathname}`);
  const refreshAnalyics = createTag('div', { class: 'widget-refresh-text' }, 'Restart');
  const refreshHolder = createTag('a', { href: '#', class: 'widget-refresh-button' }, refreshSvg);
  refreshHolder.append(refreshAnalyics);
  await loadImg(prodIcon);
  unityWidget.querySelector('.unity-action-area').append(iconHolder);
  if (!refreshIcon) return;
  cfg.refreshEnabled = true;
  const mobileRefreshHolder = refreshHolder.cloneNode(true);
  [refreshHolder, mobileRefreshHolder].forEach((el) => {
    el.addEventListener('click', (evt) => {
      evt.preventDefault();
      unityEl.dispatchEvent(new CustomEvent(refreshWidgetEvent));
    });
  });
  unityWidget.querySelector('.unity-action-area').append(refreshHolder);
  targetEl.append(mobileRefreshHolder);
}

async function handleEvent(cfg, eventHandler) {
  const { unityEl, progressCircleEvent, errorToastEvent } = cfg;
  unityEl.dispatchEvent(new CustomEvent(progressCircleEvent));
  try {
    await eventHandler();
  } catch (e) {
    unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { className: '.icon-error-request' } }));
  } finally {
    unityEl.dispatchEvent(new CustomEvent(progressCircleEvent));
  }
}

async function removeBgHandler(cfg, changeDisplay = true) {
  const {
    apiEndPoint,
    apiKey,
    errorToastEvent,
    interactiveSwitchEvent,
    targetEl,
    unityEl,
  } = cfg;
  const { endpoint } = cfg.wfDetail.removebg;
  const img = targetEl.querySelector('picture img');
  const hasExec = cfg.presentState.removeBgState.srcUrl;
  if (changeDisplay
    && hasExec
    && !(img.src.startsWith(cfg.presentState.removeBgState.srcUrl))) {
    cfg.presentState.removeBgState.assetId = null;
    cfg.presentState.removeBgState.srcUrl = null;
    cfg.presentState.changeBgState = {};
    cfg.presentState.adjustments = {};
    cfg.presentState.assetId = null;
    cfg.preludeState.adjustments = {};
  }
  const { srcUrl, assetUrl } = cfg.presentState.removeBgState;
  const urlIsValid = assetUrl ? await fetch(assetUrl) : null;
  if (cfg.presentState.removeBgState.assetId && urlIsValid?.status === 200) {
    if (changeDisplay) {
      img.src = cfg.presentState.removeBgState.assetUrl;
      cfg.preludeState.assetId = cfg.presentState.removeBgState.assetId;
      await loadImg(img);
      unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
    }
    return false;
  }
  const { origin, pathname } = new URL(img.src);
  const imgUrl = srcUrl || (img.src.startsWith('blob:') ? img.src : `${origin}${pathname}`);
  cfg.presentState.removeBgState.srcUrl = imgUrl;
  const id = await uploadAsset(cfg, imgUrl);
  if (!id) {
    unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { className: '.icon-error-request' } }));
    return false;
  }
  const removeBgOptions = {
    method: 'POST',
    headers: {
      Authorization: getGuestAccessToken(),
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: `{"surfaceId":"Unity","assets":[{"id": "${id}"}]}`,
  };
  const response = await fetch(`${apiEndPoint}/${endpoint}`, removeBgOptions);
  if (response.status !== 200) {
    unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { className: '.icon-error-request' } }));
    return false;
  }
  const { outputUrl } = await response.json();
  const opId = new URL(outputUrl).pathname.split('/').pop();
  cfg.presentState.removeBgState.assetId = opId;
  cfg.preludeState.assetId = opId;
  cfg.presentState.removeBgState.assetUrl = outputUrl;
  if (!changeDisplay) return true;
  img.src = outputUrl;
  await loadImg(img);
  unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
  return true;
}

async function removebg(cfg, featureName) {
  const { wfDetail, unityWidget } = cfg;
  const removebgBtn = unityWidget.querySelector('.ps-action-btn.removebg-button');
  if (removebgBtn) return removebgBtn;
  const btn = await createActionBtn(wfDetail[featureName].authorCfg, 'ps-action-btn removebg-button show');
  btn.addEventListener('click', async (evt) => {
    evt.preventDefault();
    handleEvent(cfg, () => removeBgHandler(cfg));
  });
  return btn;
}

async function changeBgHandler(cfg, selectedUrl = null, refreshState = true) {
  if (refreshState) resetWorkflowState();
  const {
    apiEndPoint,
    apiKey,
    targetEl,
    unityWidget,
    unityEl,
    interactiveSwitchEvent,
    errorToastEvent,
  } = cfg;
  const { endpoint } = cfg.wfDetail.changebg;
  const unityRetriggered = await removeBgHandler(cfg, false);
  const img = targetEl.querySelector('picture img');
  const fgId = cfg.presentState.removeBgState.assetId;
  const bgImg = selectedUrl || unityWidget.querySelector('.unity-option-area .changebg-options-tray img').dataset.backgroundImg;
  const { origin, pathname } = new URL(bgImg);
  const bgImgUrl = `${origin}${pathname}`;
  if (!unityRetriggered && cfg.presentState.changeBgState[bgImgUrl]?.assetId) {
    img.src = cfg.presentState.changeBgState[bgImgUrl].assetUrl;
    await loadImg(img);
    cfg.preludeState.assetId = cfg.presentState.changeBgState[bgImgUrl].assetId;
    unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
    return;
  }
  const bgId = await uploadAsset(cfg, bgImgUrl);
  const changeBgOptions = {
    method: 'POST',
    headers: {
      Authorization: getGuestAccessToken(),
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: `{
            "assets": [{ "id": "${fgId}" },{ "id": "${bgId}" }],
            "metadata": {
              "foregroundImageId": "${fgId}",
              "backgroundImageId": "${bgId}"
            }
          }`,
  };
  const response = await fetch(`${apiEndPoint}/${endpoint}`, changeBgOptions);
  if (response.status !== 200) {
    unityEl.dispatchEvent(new CustomEvent(errorToastEvent, { detail: { className: '.icon-error-request' } }));
    return;
  }
  const { outputUrl } = await response.json();
  const changeBgId = new URL(outputUrl).pathname.split('/').pop();
  cfg.presentState.changeBgState[bgImgUrl] = {};
  cfg.presentState.changeBgState[bgImgUrl].assetId = changeBgId;
  cfg.presentState.changeBgState[bgImgUrl].assetUrl = outputUrl;
  cfg.preludeState.assetId = changeBgId;
  img.src = outputUrl;
  await loadImg(img);
  unityEl.dispatchEvent(new CustomEvent(interactiveSwitchEvent));
}

async function changebg(cfg, featureName) {
  const { unityWidget, wfDetail } = cfg;
  const { authorCfg } = wfDetail[featureName];
  const changebgBtn = unityWidget.querySelector('.ps-action-btn.changebg-button');
  if (changebgBtn) return changebgBtn;
  const btn = await createActionBtn(authorCfg, 'ps-action-btn changebg-button subnav-active show');
  btn.dataset.optionsTray = 'changebg-options-tray';
  const bgSelectorTray = createTag('div', { class: 'changebg-options-tray show' });
  const bgOptions = authorCfg.querySelectorAll(':scope ul li');
  [...bgOptions].forEach((o) => {
    let thumbnail = null;
    let bgImg = null;
    [thumbnail, bgImg] = o.querySelectorAll('img');
    if (!bgImg) bgImg = thumbnail;
    thumbnail.dataset.backgroundImg = bgImg.src;
    const a = createTag('a', { href: '#', class: 'changebg-option' }, thumbnail);
    bgSelectorTray.append(a);
    a.addEventListener('click', async (evt) => {
      evt.preventDefault();
      handleEvent(cfg, () => changeBgHandler(cfg, bgImg.src, false));
    });
  });
  unityWidget.querySelector('.unity-option-area').append(bgSelectorTray);
  btn.addEventListener('click', () => {
    if (btn.classList.contains('subnav-active')) btn.classList.remove('subnav-active');
    else btn.classList.add('subnav-active');
    toggleDisplay(unityWidget.querySelector('.unity-option-area .changebg-options-tray'));
  });
  return btn;
}

function createSlider(cfg, tray, propertyName, label, cssFilter, minVal, maxVal) {
  const { targetEl } = cfg;
  const actionDiv = createTag('div', { class: 'adjustment-option' });
  const actionLabel = createTag('label', { class: 'adjustment-label' }, label);
  const actionSliderDiv = createTag('div', { class: `adjustment-container ${propertyName}` });
  const actionSliderInput = createTag('input', {
    type: 'range',
    min: minVal,
    max: maxVal,
    value: (minVal + maxVal) / 2,
    class: `adjustment-slider ${propertyName}`,
  });
  const actionAnalytics = createTag('div', { class: 'analytics-content' }, `Adjust ${label} slider`);
  const actionSliderCircle = createTag('a', { href: '#', class: `adjustment-circle ${propertyName}` }, actionAnalytics);
  actionSliderDiv.append(actionSliderInput, actionSliderCircle);
  actionDiv.append(actionLabel, actionSliderDiv);
  actionSliderInput.addEventListener('input', () => {
    const { value } = actionSliderInput;
    const centerOffset = (value - minVal) / (maxVal - minVal);
    const moveCircle = 3 + (centerOffset * 94);
    actionSliderCircle.style.left = `${moveCircle}%`;
    const img = targetEl.querySelector(':scope > picture img');
    const filterValue = cssFilter.replace('inputValue', value);
    cfg.preludeState.adjustments[propertyName] = { value, filterValue };
    const imgFilters = Object.keys(cfg.preludeState.adjustments);
    img.style.filter = '';
    imgFilters.forEach((f) => {
      img.style.filter += `${cfg.preludeState.adjustments[f].filterValue} `;
    });
  });
  actionSliderInput.addEventListener('change', () => {
    actionSliderCircle.click();
  });
  actionSliderCircle.addEventListener('click', (evt) => {
    evt.preventDefault();
  });
  tray.append(actionDiv);
}

async function changeAdjustments(cfg, featureName) {
  const { unityWidget, wfDetail, targetEl } = cfg;
  const { authorCfg } = wfDetail[featureName];
  const adjustmentBtn = unityWidget.querySelector('.ps-action-btn.adjustment-button');
  if (adjustmentBtn) {
    const img = targetEl.querySelector(':scope > picture img');
    img.style.filter = '';
    return adjustmentBtn;
  }
  const btn = await createActionBtn(authorCfg, 'ps-action-btn adjustment-button subnav-active show');
  btn.dataset.optionsTray = 'adjustment-options-tray';
  const sliderTray = createTag('div', { class: 'adjustment-options-tray show' });
  const sliderOptions = authorCfg.querySelectorAll(':scope > ul li');
  [...sliderOptions].forEach((o) => {
    let iconName = null;
    const psAction = o.querySelector(':scope > .icon');
    [...psAction.classList].forEach((cn) => { if (cn.match('icon-')) iconName = cn; });
    const [, actionName] = iconName.split('-');
    switch (actionName) {
      case 'hue':
        createSlider(cfg, sliderTray, 'hue', o.innerText, 'hue-rotate(inputValuedeg)', -180, 180);
        break;
      case 'saturation':
        createSlider(cfg, sliderTray, 'saturation', o.innerText, 'saturate(inputValue%)', 0, 300);
        break;
      default:
        break;
    }
  });
  unityWidget.querySelector('.unity-option-area').append(sliderTray);
  btn.addEventListener('click', () => {
    if (btn.classList.contains('subnav-active')) btn.classList.remove('subnav-active');
    else btn.classList.add('subnav-active');
    toggleDisplay(unityWidget.querySelector('.unity-option-area .adjustment-options-tray'));
  });
  return btn;
}

function showFeatureButton(unityWidget, prevBtn, currBtn) {
  if (!prevBtn) {
    unityWidget.querySelector('.unity-action-area').append(currBtn);
  } else {
    prevBtn.insertAdjacentElement('afterend', currBtn);
    const prevOptionTray = prevBtn?.dataset.optionsTray;
    unityWidget.querySelector(`.unity-option-area .${prevOptionTray}`)?.classList.remove('show');
    prevBtn.classList.remove('show');
  }
  const currOptionTray = currBtn.dataset.optionsTray;
  unityWidget.querySelector(`.unity-option-area .${currOptionTray}`)?.classList.add('show');
  currBtn.classList.add('show');
}

async function changeVisibleFeature(cfg) {
  const { unityWidget, enabledFeatures } = cfg;
  if (cfg.presentState.activeIdx + 1 === enabledFeatures.length) return;
  cfg.presentState.activeIdx += 1;
  const featureName = enabledFeatures[cfg.presentState.activeIdx];
  let actionBtn = null;
  switch (featureName) {
    case 'removebg':
      actionBtn = await removebg(cfg, featureName);
      break;
    case 'changebg':
      actionBtn = await changebg(cfg, featureName);
      break;
    case 'slider':
      actionBtn = await changeAdjustments(cfg, featureName);
      break;
    default:
      break;
  }
  const prevActionBtn = unityWidget.querySelector('.ps-action-btn.show');
  if (prevActionBtn === actionBtn) return;
  showFeatureButton(unityWidget, prevActionBtn, actionBtn);
}

async function resetWidgetState(cfg) {
  const { unityWidget, unityEl, targetEl } = cfg;
  cfg.presentState.activeIdx = -1;
  cfg.preludeState.adjustments = {};
  const initImg = unityEl.querySelector(':scope picture img');
  const img = targetEl.querySelector(':scope > picture img');
  img.src = initImg.src;
  img.style.filter = '';
  await changeVisibleFeature(cfg);
  unityWidget.querySelector('.widget-product-icon')?.classList.add('show');
  unityWidget.querySelector('.widget-refresh-button').classList.remove('show');
  targetEl.querySelector(':scope > .widget-refresh-button').classList.remove('show');
  await loadImg(img);
}

async function switchProdIcon(cfg, forceRefresh = true) {
  const { unityWidget, refreshEnabled, targetEl } = cfg;
  const iconHolder = unityWidget.querySelector('.widget-product-icon');
  if (!(refreshEnabled)) return;
  if (forceRefresh) {
    await resetWidgetState(cfg);
    return;
  }
  iconHolder?.classList.remove('show');
  unityWidget.querySelector('.widget-refresh-button').classList.add('show');
  targetEl.querySelector(':scope > .widget-refresh-button').classList.add('show');
}

async function uploadCallback(cfg) {
  const { enabledFeatures } = cfg;
  resetWorkflowState(cfg);
  if (enabledFeatures.length === 1) return;
  await removeBgHandler(cfg);
}

export default async function init(cfg) {
  const { targetEl, unityEl, unityWidget, interactiveSwitchEvent, refreshWidgetEvent } = cfg;
  resetWorkflowState(cfg);
  await addProductIcon(cfg);
  await changeVisibleFeature(cfg);
  const img = cfg.targetEl.querySelector('picture img');
  const uploadBtn = await createUpload(cfg, img, uploadCallback);
  unityWidget.querySelector('.unity-action-area').append(uploadBtn);
  await initAppConnector(cfg, 'photoshop');
  await decorateDefaultLinkAnalytics(unityWidget);
  unityEl.addEventListener(interactiveSwitchEvent, async () => {
    await changeVisibleFeature(cfg);
    await switchProdIcon(cfg, false);
    await decorateDefaultLinkAnalytics(unityWidget);
  });
  unityEl.addEventListener(refreshWidgetEvent, async () => {
    await switchProdIcon(cfg, true);
  });
  createIntersectionObserver({ el: targetEl, callback: switchProdIcon, cfg });
}

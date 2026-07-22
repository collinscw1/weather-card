const LitElement = customElements.get("ha-panel-lovelace")
  ? Object.getPrototypeOf(customElements.get("ha-panel-lovelace"))
  : Object.getPrototypeOf(customElements.get("hc-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const weatherIconsDay = {
  clear: "day",
  "clear-night": "night",
  cloudy: "cloudy",
  fog: "cloudy",
  hail: "rainy-7",
  lightning: "thunder",
  "lightning-rainy": "thunder",
  partlycloudy: "cloudy-day-3",
  pouring: "rainy-6",
  rainy: "rainy-5",
  snowy: "snowy-6",
  "snowy-rainy": "rainy-7",
  sunny: "day",
  windy: "cloudy",
  "windy-variant": "cloudy-day-3",
  exceptional: "!!",
};

const weatherIconsNight = {
  ...weatherIconsDay,
  clear: "night",
  sunny: "night",
  partlycloudy: "cloudy-night-3",
  "windy-variant": "cloudy-night-3",
};

const windDirections = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
  "N",
];

window.customCards = window.customCards || [];
window.customCards.push({
  type: "weather-card",
  name: "Weather Card",
  description: "A custom weather card with animated icons.",
  preview: true,
  documentationURL: "https://github.com/bramkragten/weather-card",
});

const fireEvent = (node, type, detail, options) => {
  options = options || {};
  detail = detail === null || detail === undefined ? {} : detail;
  const event = new Event(type, {
    bubbles: options.bubbles === undefined ? true : options.bubbles,
    cancelable: Boolean(options.cancelable),
    composed: options.composed === undefined ? true : options.composed,
  });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
};

function hasConfigOrEntityChanged(element, changedProps) {
  if (changedProps.has("_config") || changedProps.has("_forecastEvent")) {
    return true;
  }

  if (!changedProps.has("hass")) {
    return false;
  }

  const oldHass = changedProps.get("hass");
  if (oldHass) {
    return (
      oldHass.states[element._config.entity] !==
        element.hass.states[element._config.entity] ||
      oldHass.states["sun.sun"] !== element.hass.states["sun.sun"]
    );
  }

  return true;
}

class WeatherCard extends LitElement {
  static get properties() {
    return {
      _config: {},
      _forecastEvent: {},
      hass: {},
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: { domain: "weather" } },
        },
        {
          name: "name",
          selector: { text: {} },
        },
        { name: "current", default: true, selector: { boolean: {} } },
        { name: "details", default: true, selector: { boolean: {} } },
        { name: "forecast", default: true, selector: { boolean: {} } },
        {
          name: "forecast_type",
          default: "daily",
          selector: {
            select: {
              options: [
                { value: "hourly", label: "Hourly" },
                { value: "daily", label: "Daily" },
              ],
            },
          },
        },
        { name: "number_of_forecasts", default: 5, selector: { number: {} } },
        {
          name: "current_temperature_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "current_humidity_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "current_pressure_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "current_wind_speed_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "current_wind_direction_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "current_wind_gust_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "current_rain_rate_entity",
          selector: { entity: { domain: "sensor" } },
        },
        {
          name: "rain_alert_threshold",
          default: 0,
          selector: { number: {} },
        },
      ],
    };
  }

  static getStubConfig(hass, unusedEntities, allEntities) {
    let entity = unusedEntities.find((eid) => eid.split(".")[0] === "weather");
    if (!entity) {
      entity = allEntities.find((eid) => eid.split(".")[0] === "weather");
    }
    return { entity };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Please define a weather entity");
    }
    this._config = { forecast_type: "daily", ...config };
  }

  _needForecastSubscription() {
    return (
      this._config &&
      this._config.forecast !== false &&
      this._config.forecast_type &&
      this._config.forecast_type !== "legacy"
    );
  }

  _unsubscribeForecastEvents() {
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub());
      this._subscribed = undefined;
    }
  }

  async _subscribeForecastEvents() {
    this._unsubscribeForecastEvents();
    if (
      !this.isConnected ||
      !this.hass ||
      !this._config ||
      !this._needForecastSubscription()
    ) {
      return;
    }

    this._subscribed = this.hass.connection.subscribeMessage(
      (event) => {
        this._forecastEvent = event;
      },
      {
        type: "weather/subscribe_forecast",
        forecast_type: this._config.forecast_type,
        entity_id: this._config.entity,
      }
    );
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated && this._config && this.hass) {
      this._subscribeForecastEvents();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeForecastEvents();
  }

  shouldUpdate(changedProps) {
    return hasConfigOrEntityChanged(this, changedProps);
  }

  updated(changedProps) {
    if (!this.hass || !this._config) {
      return;
    }
    if (changedProps.has("_config") || !this._subscribed) {
      this._subscribeForecastEvents();
    }
  }

  render() {
    if (!this._config || !this.hass) {
      return html``;
    }

    this.numberElements = 0;

    const lang = this.hass.selectedLanguage || this.hass.language;
    const stateObj = this.hass.states[this._config.entity];

    if (!stateObj) {
      return html`
        <style>
          .not-found {
            flex: 1;
            background-color: var(--warning-color);
            padding: 8px;
          }
        </style>
        <ha-card>
          <div class="not-found">
            Entity not available: ${this._config.entity}
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card @click="${this._handleClick}">
        ${this.renderPrecipAlert()}
        ${this._config.current !== false ? this.renderCurrent(stateObj) : ""}
        ${this._config.details !== false
          ? this.renderDetails(stateObj, lang)
          : ""}
        ${this._config.forecast !== false
          ? this.renderForecast(
              this._forecastEvent || {
                forecast: stateObj.attributes.forecast,
                type: this._config.hourly_forecast ? "hourly" : "daily",
              },
              lang
            )
          : ""}
      </ha-card>
    `;
  }

  renderPrecipAlert() {
    const rainRate = this._getSensorValue(this._config.current_rain_rate_entity);
    const threshold = this._config.rain_alert_threshold || 0;

    if (!rainRate || rainRate.value <= threshold) {
      return "";
    }

    return html`
      <div class="precip-alert">
        <ha-icon icon="mdi:weather-pouring"></ha-icon>
        <span>Rain detected — ${rainRate.value} ${rainRate.unit}</span>
      </div>
    `;
  }

  renderCurrent(stateObj) {
    this.numberElements++;

    const name = this._config.name || stateObj.attributes.friendly_name;
    const currentTemperature = this._getSensorValue(
      this._config.current_temperature_entity
    );
    const temperature = Math.round(
      currentTemperature
        ? currentTemperature.value
        : stateObj.attributes.temperature
    );
    const temperatureUnit = currentTemperature
      ? currentTemperature.unit
      : this.getUnit("temperature");

    return html`
      <div class="header ${this.numberElements > 1 ? "spacer" : ""}">
        <div class="header-left">
          <img
            class="icon"
            src="${this.getWeatherIcon(
              stateObj.state.toLowerCase(),
              this.hass.states["sun.sun"]
            )}"
            alt="${stateObj.state}"
          />
          <span class="name">${name}</span>
        </div>
        <div class="header-right">
          <span class="temp">${temperature}</span>
          <span class="temp-unit">${temperatureUnit}</span>
        </div>
      </div>
    `;
  }

  renderDetails(stateObj, lang) {
    const sun = this.hass.states["sun.sun"];
    let next_rising;
    let next_setting;

    if (sun) {
      next_rising = new Date(sun.attributes.next_rising).toLocaleTimeString(
        lang,
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );
      next_setting = new Date(sun.attributes.next_setting).toLocaleTimeString(
        lang,
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );
    }

    const humidity = this._getSensorValue(
      this._config.current_humidity_entity
    ) || { value: stateObj.attributes.humidity, unit: "%" };

    const pressure = this._getSensorValue(
      this._config.current_pressure_entity
    ) || {
      value: stateObj.attributes.pressure,
      unit: this.getUnit("air_pressure"),
    };

    const windSpeed = this._getSensorValue(
      this._config.current_wind_speed_entity
    ) || {
      value: stateObj.attributes.wind_speed,
      unit: `${this.getUnit("length")}/h`,
    };

    const windDirectionSensor = this._getSensorValue(
      this._config.current_wind_direction_entity
    );
    const windBearing = windDirectionSensor
      ? windDirectionSensor.value
      : stateObj.attributes.wind_bearing;
    const windDirection =
      windBearing !== undefined
        ? windDirections[parseInt((windBearing + 11.25) / 22.5)]
        : "";

    const windGust = this._getSensorValue(
      this._config.current_wind_gust_entity
    );

    this.numberElements++;

    return html`
      <div class="details ${this.numberElements > 1 ? "spacer" : ""}">
        <div class="details-col">
          <div class="detail">
            <ha-icon icon="mdi:water-percent"></ha-icon>
            ${humidity.value}<span class="unit"> ${humidity.unit} </span>
          </div>
          <div class="detail">
            <ha-icon icon="mdi:gauge"></ha-icon>
            ${pressure.value}
            <span class="unit"> ${pressure.unit} </span>
          </div>
          ${next_rising
            ? html`
                <div class="detail">
                  <ha-icon icon="mdi:weather-sunset-up"></ha-icon>
                  ${next_rising}
                </div>
              `
            : ""}
        </div>
        <div class="details-col">
          <div class="detail">
            <ha-icon icon="mdi:weather-windy"></ha-icon>
            ${windDirection}
            ${windSpeed.value}<span class="unit"> ${windSpeed.unit} </span>
          </div>
          ${windGust
            ? html`
                <div class="detail">
                  <ha-icon icon="mdi:weather-windy-variant"></ha-icon>
                  ${windGust.value}<span class="unit"> ${windGust.unit} </span>
                </div>
              `
            : ""}
          ${next_setting
            ? html`
                <div class="detail">
                  <ha-icon icon="mdi:weather-sunset-down"></ha-icon>
                  ${next_setting}
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  renderForecast(forecast, lang) {
    if (!forecast || !forecast.forecast || forecast.forecast.length === 0) {
      return html``;
    }

    this.numberElements++;
    return html`
      <div class="forecast ${this.numberElements > 1 ? "spacer" : ""}">
        ${forecast.forecast
          .slice(
            0,
            this._config.number_of_forecasts
              ? this._config.number_of_forecasts
              : 5
          )
          .map(
            (daily) => html`
              <div class="day">
                <div class="dayname">
                  ${forecast.type === "hourly"
                    ? new Date(daily.datetime).toLocaleTimeString(lang, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : new Date(daily.datetime).toLocaleDateString(lang, {
                        weekday: "short",
                      })}
                </div>
                <img
                  class="icon"
                  src="${this.getWeatherIcon(daily.condition.toLowerCase())}"
                  alt="${daily.condition}"
                />
                <div class="high-temp">
                  ${daily.temperature}${this.getUnit("temperature")}
                </div>
                ${daily.templow !== undefined
                  ? html`
                      <div class="low-temp">
                        ${daily.templow}${this.getUnit("temperature")}
                      </div>
                    `
                  : ""}
              </div>
            `
          )}
      </div>
    `;
  }

  _getSensorValue(entityId) {
    if (!entityId) {
      return undefined;
    }
    const stateObj = this.hass.states[entityId];
    if (!stateObj || isNaN(parseFloat(stateObj.state))) {
      return undefined;
    }
    return {
      value: parseFloat(stateObj.state),
      unit: stateObj.attributes.unit_of_measurement || "",
    };
  }

  getWeatherIcon(condition, sun) {
    return `${
      this._config.icons
        ? this._config.icons
        : "https://cdn.jsdelivr.net/gh/bramkragten/weather-card/dist/icons/"
    }${
      sun && sun.state == "below_horizon"
        ? weatherIconsNight[condition]
        : weatherIconsDay[condition]
    }.svg`;
  }

  getUnit(measure) {
    const lengthUnit = this.hass.config.unit_system.length;
    switch (measure) {
      case "air_pressure":
        return lengthUnit === "km" ? "hPa" : "inHg";
      case "length":
        return lengthUnit;
      case "precipitation":
        return lengthUnit === "km" ? "mm" : "in";
      case "precipitation_probability":
        return "%";
      default:
        return this.hass.config.unit_system[measure] || "";
    }
  }

  _handleClick() {
    fireEvent(this, "hass-more-info", { entityId: this._config.entity });
  }

  getCardSize() {
    return 3;
  }

  static get styles() {
    return css`
      ha-card {
        cursor: pointer;
        margin: auto;
        padding: 1em;
        position: relative;
      }

      .spacer {
        margin-top: 1.5em;
      }

      .precip-alert {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #fbe9dd;
        color: #b5652b;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 12px;
        font-size: 13px;
        font-weight: 500;
      }

      .precip-alert ha-icon {
        --mdc-icon-size: 18px;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .header-left {
        display: flex;
        align-items: center;
      }

      .header .icon {
        width: 5.5em;
        height: 5.5em;
        flex-shrink: 0;
      }

      .header .name {
        font-size: 1.8em;
        font-weight: 400;
        color: var(--primary-text-color);
        margin-left: 0.3em;
      }

      .header-right {
        display: flex;
        align-items: flex-start;
      }

      .header .temp {
        font-size: 3.2em;
        font-weight: 300;
        color: var(--primary-text-color);
        line-height: 1;
      }

      .header .temp-unit {
        font-size: 1.4em;
        font-weight: 400;
        margin-top: 0.2em;
        color: var(--primary-text-color);
      }

      @media (max-width: 460px) {
        .header .name {
          font-size: 1.3em;
        }
        .header .temp {
          font-size: 2.4em;
        }
        .header .temp-unit {
          font-size: 1.1em;
        }
      }

      .details {
        display: flex;
        justify-content: space-between;
        padding: 0 0.3em;
        font-size: 0.9em;
        color: var(--primary-text-color);
      }

      .details-col {
        display: flex;
        flex-direction: column;
        gap: 0.4em;
      }

      .detail {
        display: flex;
        align-items: center;
        gap: 0.5em;
      }

      .detail ha-icon {
        --mdc-icon-size: 18px;
        color: var(--paper-item-icon-color);
      }

      .unit {
        font-size: 0.8em;
      }

      .forecast {
        width: 100%;
        margin: 0 auto;
        display: flex;
        border-top: 1px solid var(--divider-color);
        padding-top: 1.2em;
      }

      .day {
        flex: 1;
        display: block;
        text-align: center;
        color: var(--primary-text-color);
        border-right: 1px solid var(--divider-color);
        line-height: 2;
        box-sizing: border-box;
      }

      .dayname {
        text-transform: uppercase;
        font-size: 0.8em;
        font-weight: 500;
        color: var(--secondary-text-color);
      }

      .forecast .day:first-child {
        margin-left: 0;
      }

      .forecast .day:nth-last-child(1) {
        border-right: none;
        margin-right: 0;
      }

      .day .icon {
        width: 2.5em;
        height: 2.5em;
      }

      .high-temp {
        font-weight: 600;
      }

      .low-temp {
        color: var(--secondary-text-color);
      }
    `;
  }
}
customElements.define("weather-card", WeatherCard);

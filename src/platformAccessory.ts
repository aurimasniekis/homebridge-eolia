import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
  Characteristic,
} from 'homebridge';

import {PanasonicEoliaPlatform} from './platform';
import {EoliaAirConditioner, OperationMode} from 'eolia-client';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PanasonicEoliaAccessory {
    private service: Service;
    private readonly Characteristic: typeof Characteristic;
    private readonly device: EoliaAirConditioner;

    constructor(
        private readonly platform: PanasonicEoliaPlatform,
        private readonly accessory: PlatformAccessory,
    ) {

      this.device = accessory.context.device;
      this.Characteristic = this.platform.Characteristic;

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.Characteristic.Manufacturer, 'Panasonic')
          .setCharacteristic(this.Characteristic.Model, this.accessory.context.device.productCode)
          .setCharacteristic(this.Characteristic.SerialNumber, this.accessory.context.device.applianceId);

        // get the LightBulb service if it exists, otherwise create a new LightBulb service
        // you can create multiple services for each accessory
        this.service = this.accessory.getService(this.platform.Service.HeaterCooler) ||
            this.accessory.addService(this.platform.Service.HeaterCooler);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.Characteristic.Name, accessory.context.nickname)
          .setCharacteristic(this.Characteristic.Active, this.mapActive())
          .setCharacteristic(this.Characteristic.CurrentHeaterCoolerState, this.mapCurrentHeaterCoolerState())
          .setCharacteristic(this.Characteristic.TargetHeaterCoolerState, this.mapTargetHeaterCoolerState())
          .setCharacteristic(this.Characteristic.CurrentTemperature, this.mapCurrentTemperature());

        this.service.getCharacteristic(this.Characteristic.Active)
          .on('get', this.getActive.bind(this))
          .on('set', this.setActive.bind(this));

        this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
          .on('get', this.getCurrentHeaterCoolerState.bind(this));

        this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
          .on('get', this.getCurrentTemperature.bind(this));

        this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
          .on('get', this.getTargetHeaterCoolerState.bind(this))
          .on('set', this.setTargetHeaterCoolerState.bind(this));
    }

    getActive(callback: CharacteristicGetCallback) {
      callback(null, this.mapActive());
    }

    mapActive() {
      return this.device.operationStatus ? 1 : 0;
    }

    async setActive(value: CharacteristicValue, callback: CharacteristicSetCallback) {
      this.device.operationStatus = !!value;

      this.platform.log.debug('Set Characteristic Active ->', value);
      console.log(this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value);
      this.device.operationMode = this.mapValueTargetHeaterCoolerState(this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState).value ?? this.Characteristic.TargetHeaterCoolerState.AUTO);

      await this.applySettings(callback);
    }

    getCurrentHeaterCoolerState(callback: CharacteristicGetCallback) {
      callback(null, this.mapCurrentHeaterCoolerState());
    }

    mapCurrentHeaterCoolerState() {
      const currentRoomTemp = this.device.insideTemperature;
      const targetTemp = this.device.temperature;

      if (false === this.device.operationStatus) {
        return this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
      }

      switch (this.device.operationMode) {
        case OperationMode.HEATING:
          if (currentRoomTemp < targetTemp) {
            return this.Characteristic.CurrentHeaterCoolerState.HEATING;
          } else {
            return this.Characteristic.CurrentHeaterCoolerState.IDLE;
          }
        case OperationMode.COOLING:
          if (currentRoomTemp > targetTemp) {
            return this.Characteristic.CurrentHeaterCoolerState.COOLING;
          } else {
            return this.Characteristic.CurrentHeaterCoolerState.IDLE;
          }
        case OperationMode.BLAST:
          if (currentRoomTemp > targetTemp) {
            return this.Characteristic.CurrentHeaterCoolerState.COOLING;
          } else {
            return this.Characteristic.CurrentHeaterCoolerState.IDLE;
          }
        case OperationMode.COOL_DEHUMIDIFYING:
          if (currentRoomTemp > targetTemp) {
            return this.Characteristic.CurrentHeaterCoolerState.COOLING;
          } else {
            return this.Characteristic.CurrentHeaterCoolerState.IDLE;
          }
        case OperationMode.AUTO:
          if (currentRoomTemp > (targetTemp - 1)) {
            return this.Characteristic.CurrentHeaterCoolerState.COOLING;
          } else if (currentRoomTemp < (targetTemp - 1)) {
            return this.Characteristic.CurrentHeaterCoolerState.HEATING;
          } else {
            return this.Characteristic.CurrentHeaterCoolerState.IDLE;
          }
      }

      return this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    getTargetHeaterCoolerState(callback: CharacteristicGetCallback) {
      callback(null, this.mapTargetHeaterCoolerState());
    }

    mapTargetHeaterCoolerState() {
      if (false === this.device.operationStatus) {
        return this.Characteristic.TargetHeaterCoolerState.AUTO;
      }

      switch (this.device.operationMode) {
        case OperationMode.HEATING:
          return this.Characteristic.TargetHeaterCoolerState.HEAT;
        case OperationMode.COOLING:
          return this.Characteristic.TargetHeaterCoolerState.COOL;
        case OperationMode.BLAST:
          return this.Characteristic.TargetHeaterCoolerState.COOL;
        case OperationMode.COOL_DEHUMIDIFYING:
          return this.Characteristic.TargetHeaterCoolerState.COOL;
        case OperationMode.AUTO:
          return this.Characteristic.TargetHeaterCoolerState.AUTO;
      }

      return this.Characteristic.TargetHeaterCoolerState.AUTO;
    }

    mapValueTargetHeaterCoolerState(value: CharacteristicValue) {
      switch (value) {
        case this.Characteristic.TargetHeaterCoolerState.HEAT:
          return OperationMode.HEATING;
        case this.Characteristic.TargetHeaterCoolerState.COOL:
          return OperationMode.COOLING;
        case this.Characteristic.TargetHeaterCoolerState.AUTO:
        default:
          return OperationMode.AUTO;
      }
    }

    async setTargetHeaterCoolerState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
      this.device.operationMode = this.mapValueTargetHeaterCoolerState(value);

      this.platform.log.debug('Set Characteristic TargetHeaterCoolerState ->', this.device.operationMode);

      await this.applySettings(callback);
    }

    getCurrentTemperature(callback: CharacteristicGetCallback) {
      callback(null, this.mapCurrentTemperature());
    }

    mapCurrentTemperature() {
      return this.device.insideTemperature;
    }

    async applySettings(callback: CharacteristicSetCallback) {
      try {
        await this.platform.client.apply(this.device);

        callback(null);
      } catch (e) {
        console.log(e);
        this.platform.log.error('Error while applying AC state %s', JSON.stringify(e.response.data));

        callback(e);
      }
    }
}

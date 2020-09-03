import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';

import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {PanasonicEoliaAccessory} from './platformAccessory';
import {EoliaAirConditioner, AdvancedEoliaClient} from 'eolia-client';

export class PanasonicEoliaPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];
    public readonly nicknameMap = {};
    public eoliaDevices: EoliaAirConditioner[] = [];
    public readonly client: typeof EoliaAirConditioner;

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
      this.log.debug('Finished initializing platform:', this.config.name);

      this.client = new AdvancedEoliaClient(config.userId, config.password);

      (config.airConditionerRename ?? []).map((remap) => {
        this.nicknameMap[remap.nickname] = remap.alias;
      });

      // When this event is fired it means Homebridge has restored all cached accessories from disk.
      // Dynamic Platform plugins should only register new accessories after this event was fired,
      // in order to ensure they weren't added to homebridge already. This event can also be used
      // to start discovery of new accessories.
      this.api.on('didFinishLaunching', async () => {
        log.debug('Executed didFinishLaunching callback');
        // run the method to discover / register your devices as accessories
        await this.discoverDevices();
      });
    }

    /**
     * This function is invoked when homebridge restores cached accessories from disk at startup.
     * It should be used to setup event handlers for characteristics and update respective values.
     */
    configureAccessory(accessory: PlatformAccessory) {
      this.log.info('Loading accessory from cache:', accessory.displayName);

      accessory.context.device = null;

      // add the restored accessory to the accessories cache so we can track if it has already been registered
      this.accessories.push(accessory);
    }

    /**
     * This is an example method showing how to register discovered accessories.
     * Accessories must only be registered once, previously created accessories
     * must not be registered again to prevent "duplicate UUID" errors.
     */
    async discoverDevices() {
      this.eoliaDevices = await this.client.devices();
      this.log.debug('Found %d Eolia Devices', this.eoliaDevices.length);

      for (const accessory of this.accessories) {
        // We only need to do this if the device object is set.
        if (!accessory.context.device) {
          continue;
        }

        // Check to see if this accessory's device object is still in Panasonic Eolia App or not.
        if (!this.eoliaDevices.some((x: EoliaAirConditioner) => x.applianceId === accessory.context.device.applianceId)) {
          accessory.context.device = null;
        }
      }

      for (const eoaliaDevice of this.eoliaDevices) {
        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(eoaliaDevice.applianceId);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

          existingAccessory.context.device = eoaliaDevice;
          this.api.updatePlatformAccessories([existingAccessory]);

          new PanasonicEoliaAccessory(this, existingAccessory);
        } else {
          this.log.info('Adding new Air Conditioner "%s" model "%s":', eoaliaDevice.nickname, eoaliaDevice.productCode);

          let nickname = eoaliaDevice.nickname;
          if (this.nicknameMap[nickname]) {
            this.log.info('Renaming new Air Conditioner "%s" to "%s":', nickname, this.nicknameMap[nickname]);

            nickname = this.nicknameMap[nickname];
          }


          // create a new accessory
          const accessory = new this.api.platformAccessory(nickname, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = eoaliaDevice;
          accessory.context.nickname = nickname;

          // create the accessory handler for the newly create accessory
          new PanasonicEoliaAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);

          this.accessories.push(accessory);
        }
      }

      for (const oldAccessory of this.accessories) {

        const device = oldAccessory.context.device;

        if (device) {
          continue;
        }

        this.log.info('Removing Air Conditioner "%s"', oldAccessory.displayName);

        this.accessories.splice(this.accessories.indexOf(oldAccessory), 1);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [oldAccessory]);
      }

      return true;
    }
}

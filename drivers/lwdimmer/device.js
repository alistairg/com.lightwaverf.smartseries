'use strict';

const Homey = require('homey');

module.exports = class lwdimmer extends Homey.Device
{

    // this method is called when the Device is inited
    async onInit()
    {
        this.setUnavailable('initialising').catch(this.error);
        try
        {
            this.homey.app.updateLog(`Device initialising( Name: ${this.getName()}, Class: ${this.getClass()})`);

            if (await this.homey.app.getBridge().waitForBridgeReady())
            {
                this.initDevice();
            }
            this.homey.app.updateLog(`Device initialised( Name: ${this.getName()})`);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} OnInit Error: ${err}`);
        }

        // register a capability listener
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
        this.registerCapabilityListener('dim', this.onCapabilityDim.bind(this));
    }

    initDevice(extraTime = 0)
    {
        if (this.initDelay == null)
        {
            this.initDelay = this.homey.app.getDeviceIntiDelay();
            this.homey.setTimeout(() => {
                this.doInit();
            }, this.initDelay * 2000 + extraTime);
        }
    }

    async doInit()
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`);
        if (await this.getDeviceValues())
        {
            if (await this.getEnergyValues())
            {
                if (await this.registerWebhook())
                {
                    this.setAvailable().catch(this.error);
                    this.initDelay = null;
                    return;
                }
            }
        }

        // Something failed so try again later
        this.initDevice(60000);
    }

    // this method is called when the Homey device has requested a state change (turned on or off)
    async onCapabilityOnoff(value, opts)
    {
        // Get the device information stored during pairing
        const devData = this.getData();

        // The device requires '0' for off and '1' for on
        let data = '0';
        if (value)
        {
            data = '1';
        }

        // Set the switch Value on the device using the unique feature ID stored during pairing
        this.homey.app.getBridge().setFeatureValue(devData['switch'], data).catch(this.error);
    }

    // this method is called when the Homey device has requested a dim level change ( 0 to 1)
    async onCapabilityDim(value, opts)
    {
        // Homey return a value of 0 to 1 but the real device requires a value of 0 to 100
        value *= 100;

        // Get the device information stored during pairing
        const devData = this.getData();

        // Set the dim Value on the device using the unique feature ID stored during pairing
        this.homey.app.getBridge().setFeatureValue(devData.dimLevel, value).catch(this.error);
    }

    async registerWebhook()
    {
        try
        {
            const driverId = this.driver.id;
            const data = this.getData();
            const id = `${driverId}_${data.id}`;

            await Promise.all([this.homey.app.getBridge().registerWEBHooks(data.switch, 'feature', `${id}_switch`),
                this.homey.app.getBridge().registerWEBHooks(data.dimLevel, 'feature', `${id}_dimLevel`),
                this.homey.app.getBridge().registerWEBHooks(data.power, 'feature', `${id}_power`),
                this.homey.app.getBridge().registerWEBHooks(data.energy, 'feature', `${id}_energy`),
            ]);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} Failed to create webhooks ${err}`);
        }
    }

    async setWebHookValue(capability, value)
    {
        try
        {
            if (capability === 'switch')
            {
                this.setCapabilityValue('onoff', (value === 1)).catch(this.error);

                // Get the dim value if the switch when it's switched on
                if (value === 1)
                {
                    // Get the device information stored during pairing
                    const devData = this.getData();

                    // Get the current dim Value from the device using the unique feature ID stored during pairing
                    const dimLevel = await this.homey.app.getBridge().getFeatureValue(devData.dimLevel);
                    if (dimLevel >= 0)
                    {
                        this.setCapabilityValue('dim', dimLevel / 100).catch(this.error);
                    }
                }
            }
            else if (capability === 'dimLevel')
            {
                this.setCapabilityValue('dim', value / 100).catch(this.error);
            }
            else if (capability === 'power')
            {
                this.setCapabilityValue('measure_power', value).catch(this.error);
            }
            else if (capability === 'energy')
            {
                this.setCapabilityValue('meter_power', value / 1000).catch(this.error);
            }
        }
        catch (err)
        {
            return false;
        }

        return true;
    }

    async getDeviceValues()
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`, true);
        try
        {
            const devData = this.getData();

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await this.homey.app.getBridge().getFeatureValue(devData['switch']);
            switch (onoff)
            {
                case 0:
                    // Device returns 0 for off and 1 for on so convert to false and true
                    this.setCapabilityValue('onoff', false).catch(this.error);
                    break;

                case 1:
                    this.setCapabilityValue('onoff', true).catch(this.error);
                    break;

                default:
                    // Bad response
                    break;
            }

            // Only get the dim value if the switch is on or is currently unknown
            if ((onoff === 1) || (this.getCapabilityValue('dimLevel') === null))
            {
                // Get the current dim Value from the device using the unique feature ID stored during pairing
                const dimLevel = await this.homey.app.getBridge().getFeatureValue(devData.dimLevel);
                if (dimLevel >= 0)
                {
                    this.setCapabilityValue('dim', dimLevel / 100).catch(this.error);
                }
            }
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`${this.getName()} getDeviceValues Error ${err}`);
            return false;
        }

        return true;
    }

    async getEnergyValues()
    {
        try
        {
            const devData = this.getData();

            // If the device supports energy then fetch the current value
            if (typeof devData.energy === 'string')
            {
                const energy = await this.homey.app.getBridge().getFeatureValue(devData.energy);
                if (energy >= 0)
                {
                    this.setCapabilityValue('meter_power', energy / 1000).catch(this.error);
                }
            }

            // If the device supports power then fetch the current value
            if (typeof devData.power === 'string')
            {
                const power = await this.homey.app.getBridge().getFeatureValue(devData.power);
                if (power >= 0)
                {
                    this.setCapabilityValue('measure_power', power).catch(this.error);
                }
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} getDeviceValues Error ${err}`);
            return false;
        }

        return true;
    }

};

// module.exports = MyDevice;

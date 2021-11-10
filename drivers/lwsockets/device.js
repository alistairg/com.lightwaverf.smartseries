'use strict';

const Homey = require('homey');

module.exports = class lwsockets extends Homey.Device
{

    async onInit()
    {
        this.setUnavailable('initialising').catch(this.error);
        try
        {
            this.homey.app.updateLog(`Device initialising( Name: ${this.getName()}, Class: ${this.getClass()})`);

            if (await this.homey.app.getBridge().waitForBridgeReady())
            {
                const initDelay = this.homey.app.getDeviceIntiDelay();
                this.homey.setTimeout(() => {
                    this.initDevice();
                }, initDelay * 1000);
            }
            this.homey.app.updateLog(`Device initialised( Name: ${this.getName()})`);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} OnInit Error: ${err}`);
        }
        // register a capability listener
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    }

    async initDevice()
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`);
        await this.getDeviceValues();
        await this.getEnergyValues();
        await this.registerWebhook();
        this.setAvailable().catch(this.error);
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

    async registerWebhook()
    {
        try
        {
            const driverId = this.driver.id;
            const data = this.getData();
            const id = `${driverId}_${data.id}`;

            await Promise.all([this.homey.app.getBridge().registerWEBHooks(data.switch, 'feature', `${id}_switch`),
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

        }
    }

    async getDeviceValues(ValueList)
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`, true);

        try
        {
            const devData = this.getData();
            // console.log( devData );

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await this.homey.app.getBridge().getFeatureValue(devData['switch'], ValueList);
            switch (onoff)
            {
                case 0:
                    // Device returns 0 for off and 1 for on so convert o false and true
                    this.setCapabilityValue('onoff', false).catch(this.error);
                    break;

                case 1:
                    this.setCapabilityValue('onoff', true).catch(this.error);
                    break;

                default:
                    // Bad response so set as unavailable for now
                    // this.setUnavailable();
                    break;
            }
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`${this.getName()} getDeviceValues Error ${err}`);
        }
    }

    async getEnergyValues(ValueList)
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
        }
    }

};

// module.exports = MyDevice;

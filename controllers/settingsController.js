const { Settings } = require('../models');
const catchAsync = require('../utils/catchAsync');

exports.getSettings = catchAsync(async (req, res) => {
    const settings = await Settings.findByPk(1);
    if (!settings) {
        // Create default settings if they don't exist
        const defaultSettings = await Settings.create({
            id: 1,
            platformName: 'Vico Exchange',
            adminEmail: 'noblegodwin02@gmail.com',
            supportEmail: 'godwinhigh@gmail.com',
            supportPhone: '08144098649',
            defaultCurrency: 'NGN',
            maintenanceMode: false,
            facebookUrl: 'https://web.facebook.com/godwin.inyene.5',
            twitterUrl: null,
            instagramUrl: 'https://www.instagram.com/wintechsystems_2/',
            linkedinUrl: 'https://www.linkedin.com/in/godwin-inyene-598714233/',
            youtubeUrl: null,
            tiktokUrl: 'https://www.tiktok.com/@geehigh07?lang=en'
        });

        return res.status(200).json({
            status: 'success',
            data: {
                settings: defaultSettings
            }
        });
    }
    res.status(200).json({
        status: 'success',
        data: {
            settings
        }
    });
})


exports.updateSettings = catchAsync(async (req, res) => {
    // Check if settings exist
    let settings = await Settings.findByPk(1);

    if (!settings) {
        // Create new settings if they don't exist
        req.body.id = 1
        settings = await Settings.create();
    } else {
        // Update existing settings
        await settings.update(req.body);
    }

    // Fetch the updated settings
    const updatedSettings = await Settings.findByPk(1);

    res.status(200).json({
        status: 'success',
        data: {
            settings: updatedSettings
        }
    });
});

// Get specific setting by key
exports.getSetting = catchAsync(async (req, res) => {

    const { key } = req.params;

    const settings = await Settings.findByPk(1, {
        attributes: [key]
    });

    if (!settings) {
        return res.status(404).json({
            status: 'error',
            message: 'Settings not found'
        });
    }

    res.status(200).json({
        status: 'success',
        data: {
            key,
            value: settings[key]
        }
    });

});

// Get specific setting by key
exports.getSetting = catchAsync(async (req, res) => {

    const { key } = req.params;

    const settings = await Settings.findByPk(1, {
        attributes: [key]
    });

    if (!settings) {
        return res.status(404).json({
            status: 'error',
            message: 'Settings not found'
        });
    }

    res.status(200).json({
        status: 'success',
        data: {
            key,
            value: settings[key]
        }
    });

})


// Toggle maintenance mode
exports.toggleMaintenanceMode = catchAsync(async (req, res) => {

    const settings = await Settings.findByPk(1);

    if (!settings) {
        return res.status(404).json({
            status: 'error',
            message: 'Settings not found'
        });
    }

    const newMaintenanceMode = !settings.maintenanceMode;
    await settings.update({ maintenanceMode: newMaintenanceMode });

    res.status(200).json({
        status: 'success',
        data: {
            maintenanceMode: newMaintenanceMode
        }
    });
})
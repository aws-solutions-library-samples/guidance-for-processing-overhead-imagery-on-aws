// const CopyWebpackPlugin = require('copy-webpack-plugin');
// const path = require('path');

const webpack = require('webpack');

/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['ol', 'ol-ext', 'resium', 'cesium'],
    webpack: (config) => {
        // Existing OpenLayers config
        config.resolve.alias = {
            ...config.resolve.alias,
            'ol/ol.css': 'ol/ol.css',
        };

        // Add Cesium config
        config.plugins.push(
            new webpack.DefinePlugin({
                CESIUM_BASE_URL: JSON.stringify("cesium"),
            }),
        );

        config.resolve.fallback = {
            ...config.resolve.fallback,
            https: false,
            zlib: false,
            http: false,
            url: false,
        };

        return config;
    }
};

module.exports = nextConfig;
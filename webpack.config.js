const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
//const CopyWebpackPlugin = require('copy-webpack-plugin');
//const WebpackShellPluginNext = require('webpack-shell-plugin-next');

module.exports = (env, argv) => {
    const mode = argv?.mode || 'production';
    console.log('Webpack configs：');
    console.log('Mode:', mode);
    console.log('Code Optimization:', mode === 'production');

    return{
    mode: mode,//production: 优化打包输出和构建性能的模式；development: 开发模式
    entry: {
        'index': './src/init/index.ts',
    },
    output: {
        path: path.resolve(__dirname, 'dist'), // 输出路径
        filename: 'js/[name].[contenthash].js', // 输出文件名
        clean: true, // 清除dist目录
    },
    resolve: {
        //设置类型可以作为模块被引用
        extensions: [".ts", ".tsx", ".js"],
        alias: {
            "@": path.resolve(__dirname, "src"), //配置@指向src目录
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/, // 匹配 TypeScript 文件
                use: "ts-loader", // 使用 ts-loader 处理 TypeScript 文件
                exclude: /node_modules/ // 排除 node_modules 文件夹
            },
            {
                test: /\.(css|scss)$/,
                use: [
                    {
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            esModule: true,
                        },
                    },
                    "css-loader",//处理css文件
                    'sass-loader',//编译SCSS文件
                ],
            },
            {
                test: /\.html$/,
                use: [
                    {
                        loader: 'html-loader',
                        options: {
                            minimize: true, // 压缩html
                            /*sources: {
                                list: [
                                    "...",
                                    {
                                        tag: "img",
                                        attribute: "src",
                                        type: "src",
                                        filter: () => false,//忽略img中的src
                                    },
                                ],
                            }*/

                        },
                    },
                ],
            },
            {
                test: /\.(png|jpe?g|gif|svg|webp)$/i,
                type: 'asset/resource',
                parser: {
                    dataUrlCondition: {
                        maxSize: 3 * 1024, // 小于3KB的图片转为base64
                    },
                },
                generator: {
                    filename: 'assets/img/[hash:10][ext][query]', // 指定打包路径和文件名
                },
            },
            {
                test: /\.(ttf|woff|woff2|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/fonts/[hash:10][ext][query]', // 指定打包路径和文件名
                },
            }
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html', // 指定模板文件
            filename: 'index.html', // 输出文件名
            inject: 'head',//插入在head标签
            chunks: ['index'],//插入的入口文件
        }),

        new MiniCssExtractPlugin(
            {
                filename: 'assets/css/[name].[contenthash].css',
                chunkFilename: 'assets/css/[id].[contenthash].chunk.css',
            }
        ),
    ],
        optimization: {
            minimize: mode === 'production', //强制开启代码压缩
            usedExports: mode === 'production', //标记未使用代码
            // package.json中的"sideEffects"表示告诉Webpack哪些文件有副作用，哪些没有。
            // "sideEffects": false, //表示整个项目无副作用，最激进，不建议使用
            // "sideEffects": [
            //    "*.css", //CSS等文件有副作用，必须保留导入。因为引用css时不会使用，可能会导致被其认为是未使用的代码
            //    "*.scss",
            //    "./src/init/**/*" //入口文件等初始化文件一定是有副作用的，否则大部分代码都会被移除。必须保留导入
            // ]
            sideEffects: mode === 'production', //启用副作用优化，移除被标记的未使用代码
            minimizer: [

                new CssMinimizerPlugin({

                    minimizerOptions: {
                        preset: [
                            'default',
                            {
                                discardComments: { removeAll: true },//移除所有css注释
                            },
                        ],
                    },
                }),//压缩css
                new TerserPlugin({
                    terserOptions: {
                        format: {
                            comments: false, // 移除所有注释
                        },
                        //移除console和debugger
                        compress: {
                            drop_console: true,
                            drop_debugger: true,
                            pure_funcs: ['console.log'],//移除特定函数
                        },
                    },
                    parallel: true,//启用并行压缩
                }),//压缩js
            ],
        },
    /*devServer: {
        static: {//指定dist文件为静态文件来源，用于读取一些用脚本处理的文件
            directory: path.join(__dirname, 'dist')
        },
    },*/
    }
};
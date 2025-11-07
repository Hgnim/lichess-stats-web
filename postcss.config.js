module.exports = {
    plugins: [
        require('postcss-csso')({
            // 配置选项
            preset: 'default'//safe,default,aggressive
        }),
    ],
};
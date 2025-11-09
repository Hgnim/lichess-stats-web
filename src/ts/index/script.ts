import * as echarts from 'echarts';
import {EChartsType} from "echarts";
import {gamesToKLines, KLine, streamUserGames} from './getGames';
import {getCookie, setCookie} from "@/ts/global/cookie";

(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    await doWork(urlParams.get("user"),urlParams.get("perf") as Parameters<typeof streamUserGames>[1])
})();

/**开始生成*/
async function doWork(/*用户名*/USER:string|null,/*棋局类型*/PERF: Parameters<typeof streamUserGames>[1]|null){
    try {
        if(!USER || !PERF) {
            console.log('user或perf参数错误或不存在。');
            return;
        }
        const chartEl:HTMLElement|null = document.getElementById('chart');
        if (!chartEl) {
            console.error('找不到chart容器');
            return;
        }

        //cookie缓存，曾经拉取过将会缓存
        const cookieTemp:KLine[]|null = (():KLine[]|null=>{
            const jsonStr:string|null=localStorage.getItem(`${USER}/${PERF}`); //getCookie(`${USER}/${PERF}`);
            if(jsonStr)
                return JSON.parse(jsonStr) as KLine[];
            else
                return null;
        })();

        console.log(`正在拉取用户${USER}的${PERF}类型的对局...`);
        const games: any[] = [];
        {
            let since:number|null=null;
            if (cookieTemp){
                let date= new Date(cookieTemp[cookieTemp.length-1].time*1000);
                date.setDate(date.getDate() + 1);
                since=date.getTime();
                console.log(`cookie缓存的最后时间戳/明天的时间戳: ${cookieTemp[cookieTemp.length-1].time*1000}/${since}`);
            }

            for await (const g of streamUserGames(USER, PERF, since)) {
                games.push(g);
            }
        }
        console.log(`共拉取了${games.length}个对局`);

        //转换为k线数据
        let klines:KLine[] = gamesToKLines(games, USER);
        let haveNewKl:boolean=true;//判断当前是否有新的数据被拉取
        console.log(`生成了${klines.length}根K线`);
        if (klines.length === 0) {
            haveNewKl=false;
            console.warn('拉取并生成的K线数据长度为0');
            if (cookieTemp==null) return;
        }
        if (cookieTemp){
            klines=[...cookieTemp, ...klines];
            console.info('k线缓存已与新数据合并');
        }

        //转换为ECharts的格式
        const ecData:number[][] = klines.map(k => [
            k.time * 1000, //ECharts使用的是毫秒时间戳
            k.open,
            k.close,
            k.low,
            k.high,
            k.gameCount||0,
            k.winLoseDrawCount?.winCount||0,
            k.winLoseDrawCount?.loseCount||0,
            k.winLoseDrawCount?.drawCount||0,
        ]);

        const chart:EChartsType = echarts.init(chartEl);
        const option: echarts.EChartsOption = {
            backgroundColor: '#111',
            grid: { left: '10%', right: '10%', bottom: '15%', top: '10%' },
            dataZoom: [
                {
                    type: 'inside',//鼠标滚轮缩放、拖拽平移
                    start: 0,
                    end: 100,
                    //minValueSpan: 7 * 24 * 3600 * 1000, // 最少显示7天
                },
                {
                    type: 'slider',//启用底部滑块控件
                    start: 0,
                    end: 100,
                    height: 20,
                    bottom: 20,
                    backgroundColor: '#333',
                    borderColor: '#555',
                    fillerColor: 'rgba(56, 155, 255, 0.2)',
                    handleStyle: { color: '#389bff' },
                }
            ],
            xAxis: {
                type: 'time',
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: {
                    interval: 'auto',//动态间隔
                    fontSize: 9,
                    hideOverlap: true,
                    //formatter: '{yyyy}-{MM}-{dd}',
                    formatter: (value: number) => {
                        return new Intl.DateTimeFormat('zh-CN', {
                            timeZone: 'Asia/Shanghai',
                            month: '2-digit',
                            day: '2-digit'
                        }).format(value);
                    }
                },
                axisPointer: {
                    label: {
                        show: true,
                        formatter: (params: any) => {
                            if (params.axisDimension === 'x') {
                                const d = new Date(params.value);
                                //底部显示格式为yyyy-MM-dd
                                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                            }
                            return params.value;
                        }
                    }
                },
                minInterval: 1000*60*60*24, // 最小间隔1天
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLine: { lineStyle: { color: '#444' } },
                axisLabel: { color: '#DDD' },
                splitLine: {
                    lineStyle: {
                        color: '#333',
                        type: 'dashed',//y轴虚线网格线
                    }
                },
            },
            series: [{
                type: 'candlestick',
                data: ecData,
                itemStyle: {
                    color: '#e60000',//涨
                    color0: '#FFFFFF00',//跌
                    borderColor: '#e60000',//涨
                    borderColor0: '#00e600',//跌
                    borderColorDoji: '#999',
                },
                barWidth: '90%',//k线柱宽度
            }],
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: 'rgba(0,0,0,0.9)',
                textStyle: { color: '#DDD' },
                formatter: (params: any) => {
                    const data = params[0].data;
                    const date = new Date(data[0]).toLocaleDateString('zh-CN');

                    return `
                            <div class="tooltip">
                              <div class="date"><strong>${date}</strong></div>
                              <div>开始等级分: <strong>${data[1]}</strong></div>
                              <div>收尾等级分: <strong>${data[2]}</strong></div>
                              <div>最高等级分: <strong>${data[4]}</strong></div>
                              <div>最低等级分: <strong>${data[3]}</strong></div>
                              <hr class="line">
                              <div>当日对局: <strong>${data[5]}</strong>局</div>
                              <div>胜/负/和: <strong>${data[6]}</strong>/<strong>${data[7]}</strong>/<strong>${data[8]}</strong></div>
                            </div>
                           `;
                }
            },
        };
        chart.setOption(option);//设置选项并渲染

        window.addEventListener('resize', () => {
            chart.resize();//随窗口变化自动调整大小
        });
        console.log('图表渲染完成！');

        if (haveNewKl) {
            //setCookie(`${USER}/${PERF}`,JSON.stringify(klines),3650);
            localStorage.setItem(`${USER}/${PERF}`, JSON.stringify(klines));
            console.log(`检测到新数据。用户：${USER}；类型：${PERF}，k线缓存已保存。`);
        }
    } catch (error) {
        console.error('发生错误:', error);
    }
}

export function submitButton_Click(){
    const ui:HTMLInputElement|null=document.getElementById('user-input') as HTMLInputElement;
    const ps:HTMLInputElement|null=document.getElementById('perf-select') as HTMLInputElement;
    if (ui && ps){
        doWork(ui.value,ps.value as Parameters<typeof streamUserGames>[1]);
    }
}
(window as any).submitButton_Click=submitButton_Click;
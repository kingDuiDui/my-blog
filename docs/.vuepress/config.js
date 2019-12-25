const glob = require('glob');
const path = require('path');

function getChildren() {
	const cwd = path.join(__dirname, '../', 'Blog');
	const pattern = '**/*.md';
	const list = glob.sync(pattern, { cwd });
	const children = list.map(i => i.replace('.md', '')).map(i => (i === 'README' ? '' : i));
	children.sort();
	return children;
}

// dcos/.vuepress/config.js
module.exports = {
	title: 'JIN XIN', // 设置网站标题
	dest: './dist', // 设置输出目录
	base: '', // 设置站点根路径
	repo: 'https://github.com/jinxin0112/my-blog', // 添加 github 链接
	plugins: ['vuepress-plugin-cat'],
	themeConfig: {
		nav: [{ text: 'GitHub', link: 'https://github.com/jinxin0112/my-blog' }],
		sidebar: {
			'/Blog/': [
				{
					title: 'my blog',
					collapsable: false,
					children: getChildren()
				}
			]
		},
		lastUpdated: 'Last Updated'
	}
};

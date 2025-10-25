const { sequelize } = require('../config/database');

const User = require('./User');
const UserSession = require('./UserSession');
const NewsSource = require('./NewsSource');
const NewsCategory = require('./NewsCategory');
const NewsArticle = require('./NewsArticle');
const ArticleCategory = require('./ArticleCategory');
const AIAnalysis = require('./AIAnalysis');
const AICache = require('./AICache');
const UserReadingHistory = require('./UserReadingHistory');
const UserInterest = require('./UserInterest');
const FinancialCategory = require('./FinancialCategory');
const FinancialTransaction = require('./FinancialTransaction');
const Budget = require('./Budget');
const FinancialGoal = require('./FinancialGoal');
const SystemConfig = require('./SystemConfig');
const FetchLog = require('./FetchLog');

User.hasMany(UserSession, { foreignKey: 'user_id', as: 'sessions' });
UserSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(UserReadingHistory, { foreignKey: 'user_id', as: 'readingHistory' });
UserReadingHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(UserInterest, { foreignKey: 'user_id', as: 'interests' });
UserInterest.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(FinancialTransaction, { foreignKey: 'user_id', as: 'transactions' });
FinancialTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Budget, { foreignKey: 'user_id', as: 'budgets' });
Budget.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(FinancialGoal, { foreignKey: 'user_id', as: 'goals' });
FinancialGoal.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

NewsCategory.hasMany(NewsCategory, { foreignKey: 'parent_id', as: 'children' });
NewsCategory.belongsTo(NewsCategory, { foreignKey: 'parent_id', as: 'parent' });

NewsSource.hasMany(NewsArticle, { foreignKey: 'source_id', as: 'articles' });
NewsArticle.belongsTo(NewsSource, { foreignKey: 'source_id', as: 'source' });

NewsSource.hasMany(FetchLog, { foreignKey: 'source_id', as: 'fetchLogs' });
FetchLog.belongsTo(NewsSource, { foreignKey: 'source_id', as: 'source' });

NewsArticle.hasMany(ArticleCategory, { foreignKey: 'article_id', as: 'categories' });
ArticleCategory.belongsTo(NewsArticle, { foreignKey: 'article_id', as: 'article' });

NewsCategory.hasMany(ArticleCategory, { foreignKey: 'category_id', as: 'articles' });
ArticleCategory.belongsTo(NewsCategory, { foreignKey: 'category_id', as: 'category' });

NewsArticle.hasMany(AIAnalysis, { foreignKey: 'article_id', as: 'aiAnalyses' });
AIAnalysis.belongsTo(NewsArticle, { foreignKey: 'article_id', as: 'article' });

NewsArticle.hasMany(UserReadingHistory, { foreignKey: 'article_id', as: 'readingHistory' });
UserReadingHistory.belongsTo(NewsArticle, { foreignKey: 'article_id', as: 'article' });

NewsCategory.hasMany(UserInterest, { foreignKey: 'category_id', as: 'userInterests' });
UserInterest.belongsTo(NewsCategory, { foreignKey: 'category_id', as: 'category' });

FinancialCategory.hasMany(FinancialCategory, { foreignKey: 'parent_id', as: 'children' });
FinancialCategory.belongsTo(FinancialCategory, { foreignKey: 'parent_id', as: 'parent' });

FinancialCategory.hasMany(FinancialTransaction, { foreignKey: 'category_id', as: 'transactions' });
FinancialTransaction.belongsTo(FinancialCategory, { foreignKey: 'category_id', as: 'category' });

FinancialCategory.hasMany(Budget, { foreignKey: 'category_id', as: 'budgets' });
Budget.belongsTo(FinancialCategory, { foreignKey: 'category_id', as: 'category' });

module.exports = {
  sequelize,
  User,
  UserSession,
  NewsSource,
  NewsCategory,
  NewsArticle,
  ArticleCategory,
  AIAnalysis,
  AICache,
  UserReadingHistory,
  UserInterest,
  FinancialCategory,
  FinancialTransaction,
  Budget,
  FinancialGoal,
  SystemConfig,
  FetchLog
};
